import { randomUUID } from "node:crypto";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import {
  type IntegrationRequest,
  type IntegrationResult,
  IntegrationResultSchema,
  type ChangeSetMetadata,
} from "../domain/workspace.js";
import { EventTypes } from "../domain/event.js";
import { EventStore } from "../event-state/event-store.js";
import { WorkspaceRepository } from "../persistence/repositories/workspace-repository.js";
import { TaskClaimManager } from "../tasks/task-claim-manager.js";
import { GitWorktreeManager } from "./git-worktree-manager.js";
import { ChangeSetCalculator } from "./change-set-calculator.js";
import { ConflictDetector } from "./conflict-detector.js";

const execAsync = promisify(exec);

export interface WorkspaceIntegratorOptions {
  workspaceRepo: WorkspaceRepository;
  claimManager?: TaskClaimManager;
  worktreeManager?: GitWorktreeManager;
  changeSetCalculator?: ChangeSetCalculator;
  conflictDetector?: ConflictDetector;
  eventStore?: EventStore;
  verificationFn?: (worktreePath: string) => Promise<boolean>;
}

/**
 * Safe Workspace Integrator.
 * Orchestrates pre-integration checks, ownership fencing verification,
 * user-work protection, conflict detection, verification gates, and atomic merge.
 * PRD Part 2 Section 55.
 */
export class WorkspaceIntegrator {
  private readonly workspaceRepo: WorkspaceRepository;
  private readonly claimManager?: TaskClaimManager;
  private readonly worktreeManager: GitWorktreeManager;
  private readonly changeSetCalculator: ChangeSetCalculator;
  private readonly conflictDetector: ConflictDetector;
  private readonly eventStore?: EventStore;
  private readonly verificationFn?: (worktreePath: string) => Promise<boolean>;

  constructor(options: WorkspaceIntegratorOptions) {
    this.workspaceRepo = options.workspaceRepo;
    this.claimManager = options.claimManager;
    this.worktreeManager = options.worktreeManager ?? new GitWorktreeManager();
    this.changeSetCalculator = options.changeSetCalculator ?? new ChangeSetCalculator();
    this.conflictDetector = options.conflictDetector ?? new ConflictDetector();
    this.eventStore = options.eventStore;
    this.verificationFn = options.verificationFn;
  }

  /**
   * Safely integrate a workspace's changes into the target repository branch.
   */
  public async integrate(
    request: IntegrationRequest,
    repoPath: string = process.cwd()
  ): Promise<IntegrationResult> {
    const ws = this.workspaceRepo.findById(request.workspaceId);
    if (!ws) {
      return IntegrationResultSchema.parse({
        success: false,
        workspaceId: request.workspaceId,
        status: "ERROR",
        errorMessage: `Workspace "${request.workspaceId}" not found.`,
      });
    }

    // 1. Fencing & Ownership Verification
    if (this.claimManager) {
      const isOwner = this.claimManager.verifyOwnership(
        request.taskId,
        request.leaseId,
        request.generation,
        request.agentId
      );
      if (!isOwner) {
        if (this.eventStore) {
          this.eventStore.append({
            id: randomUUID(),
            schemaVersion: 1,
            actor: "system",
            timestamp: new Date().toISOString(),
            type: EventTypes.WORKSPACE_INTEGRATION_REJECTED,
            projectId: ws.projectId,
            taskId: ws.taskId,
            agentId: ws.agentId,
            payload: {
              workspaceId: ws.id,
              reason: "FENCING_VIOLATION",
              attemptedGeneration: request.generation,
            },
          });
        }
        return IntegrationResultSchema.parse({
          success: false,
          workspaceId: request.workspaceId,
          status: "FENCING_VIOLATION",
          errorMessage: `Integration rejected: Stale ownership fencing token (generation ${request.generation}) for task "${request.taskId}".`,
        });
      }
    }

    // 2. User-Work Protection: Check Target Repository Working Tree
    let targetStatus;
    try {
      targetStatus = await this.worktreeManager.inspectWorkingTree(repoPath);
    } catch (err: any) {
      return IntegrationResultSchema.parse({
        success: false,
        workspaceId: request.workspaceId,
        status: "ERROR",
        errorMessage: `Failed to inspect target repository: ${err.message}`,
      });
    }

    if (!targetStatus.isClean) {
      return IntegrationResultSchema.parse({
        success: false,
        workspaceId: request.workspaceId,
        status: "USER_CHANGE_BLOCKED",
        errorMessage: `Target repository has uncommitted user modifications. Integration is blocked to prevent data loss.`,
      });
    }

    // 3. Calculate ChangeSet for Current Workspace
    let changeSet: ChangeSetMetadata;
    try {
      changeSet = await this.changeSetCalculator.calculate(
        ws.id,
        ws.worktreePath,
        ws.baseCommit,
        targetStatus.headCommit
      );
      this.workspaceRepo.saveChangeSet(changeSet);
    } catch (err: any) {
      return IntegrationResultSchema.parse({
        success: false,
        workspaceId: request.workspaceId,
        status: "ERROR",
        errorMessage: `Failed to calculate changeset: ${err.message}`,
      });
    }

    // 4. Fetch Active Peer ChangeSets for Conflict Analysis
    const peerWorkspaces = this.workspaceRepo.findActiveByProjectId(ws.projectId);
    const peerChangeSets: ChangeSetMetadata[] = [];
    for (const peer of peerWorkspaces) {
      if (peer.id !== ws.id) {
        const cs = this.workspaceRepo.getChangeSet(peer.id);
        if (cs) peerChangeSets.push(cs);
      }
    }

    // 5. Detect Conflicts
    const conflict = this.conflictDetector.detectConflicts(
      changeSet,
      peerChangeSets,
      targetStatus
    );

    if (conflict) {
      this.workspaceRepo.saveConflictReport(conflict);
      this.workspaceRepo.updateStatus(ws.id, "CONFLICT_DETECTED");

      if (this.eventStore) {
        this.eventStore.append({
          id: randomUUID(),
          schemaVersion: 1,
          actor: "system",
          timestamp: new Date().toISOString(),
          type: EventTypes.WORKSPACE_CONFLICT_DETECTED,
          projectId: ws.projectId,
          taskId: ws.taskId,
          agentId: ws.agentId,
          payload: {
            workspaceId: ws.id,
            conflictType: conflict.conflictType,
            conflictingFiles: conflict.conflictingFiles,
            details: conflict.details,
          },
        });
      }

      return IntegrationResultSchema.parse({
        success: false,
        workspaceId: request.workspaceId,
        conflictReport: conflict,
        status: "CONFLICT_REJECTED",
        errorMessage: `Integration rejected due to ${conflict.conflictType}: ${conflict.details}`,
      });
    }

    // 6. Verification Gate
    if (request.runVerification && this.verificationFn) {
      this.workspaceRepo.updateStatus(ws.id, "VERIFYING");
      const passed = await this.verificationFn(ws.worktreePath);
      if (!passed) {
        this.workspaceRepo.updateStatus(ws.id, "FAILED");
        return IntegrationResultSchema.parse({
          success: false,
          workspaceId: request.workspaceId,
          status: "VERIFICATION_FAILED",
          errorMessage: `Verification gate failed prior to integration.`,
        });
      }
    }

    // 7. Atomic Integration (Merge worktree branch into target)
    let integratedCommit: string;
    try {
      if (this.eventStore) {
        this.eventStore.append({
          id: randomUUID(),
          schemaVersion: 1,
          actor: "system",
          timestamp: new Date().toISOString(),
          type: EventTypes.WORKSPACE_INTEGRATION_STARTED,
          projectId: ws.projectId,
          taskId: ws.taskId,
          agentId: ws.agentId,
          payload: { workspaceId: ws.id, branch: ws.branchName },
        });
      }

      // Merge worktree branch into target repository branch
      const commitMsg = request.commitMessage || `feat(task): integrate workspace ${ws.id} for task ${ws.taskId}`;
      await execAsync(`git merge "${ws.branchName}" -m "${commitMsg}"`, { cwd: repoPath });

      const { stdout: headOut } = await execAsync("git rev-parse HEAD", { cwd: repoPath });
      integratedCommit = headOut.trim();
    } catch (err: any) {
      return IntegrationResultSchema.parse({
        success: false,
        workspaceId: request.workspaceId,
        status: "ERROR",
        errorMessage: `Git merge failed: ${err.message}`,
      });
    }

    // 8. Update Workspace Status & Emit Audit Events
    this.workspaceRepo.updateStatus(ws.id, "INTEGRATED");

    if (this.eventStore) {
      this.eventStore.append({
        id: randomUUID(),
        schemaVersion: 1,
        actor: "system",
        timestamp: new Date().toISOString(),
        type: EventTypes.WORKSPACE_INTEGRATED,
        projectId: ws.projectId,
        taskId: ws.taskId,
        agentId: ws.agentId,
        payload: {
          workspaceId: ws.id,
          integratedCommit,
          filesModified: changeSet.filesModified,
          filesAdded: changeSet.filesAdded,
        },
      });
    }

    return IntegrationResultSchema.parse({
      success: true,
      workspaceId: request.workspaceId,
      integratedCommit,
      status: "INTEGRATED",
    });
  }
}
