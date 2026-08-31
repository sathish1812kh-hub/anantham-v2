import { randomUUID } from "node:crypto";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import {
  type ExecutionWorkspace,
} from "../domain/workspace.js";
import { EventTypes } from "../domain/event.js";
import { EventStore } from "../event-state/event-store.js";
import { WorkspaceRepository } from "../persistence/repositories/workspace-repository.js";
import { LeaseRepository } from "../persistence/repositories/lease-repository.js";
import { GitWorktreeManager } from "./git-worktree-manager.js";

const execAsync = promisify(exec);

export interface WorkspaceRecoverySummary {
  inspectedCount: number;
  activeCount: number;
  quarantinedCount: number;
  cleanedCount: number;
  quarantinedWorkspaces: string[];
}

export interface WorkspaceRecoveryEngineOptions {
  workspaceRepo: WorkspaceRepository;
  leaseRepo?: LeaseRepository;
  worktreeManager?: GitWorktreeManager;
  eventStore?: EventStore;
}

/**
 * Workspace Recovery Engine.
 * Scans for abandoned/stale workspaces after process crashes, reconciles task leases,
 * preserves dirty worktrees into quarantine patch artifacts, and cleans up empty worktrees.
 * PRD Part 1 Section 56, PRD Part 2 Section 56.
 */
export class WorkspaceRecoveryEngine {
  private readonly workspaceRepo: WorkspaceRepository;
  private readonly leaseRepo?: LeaseRepository;
  private readonly worktreeManager: GitWorktreeManager;
  private readonly eventStore?: EventStore;

  constructor(options: WorkspaceRecoveryEngineOptions) {
    this.workspaceRepo = options.workspaceRepo;
    this.leaseRepo = options.leaseRepo;
    this.worktreeManager = options.worktreeManager ?? new GitWorktreeManager();
    this.eventStore = options.eventStore;
  }

  /**
   * Scan and recover workspaces for a project.
   */
  public async recoverWorkspaces(
    projectId: string,
    repoPath: string = process.cwd()
  ): Promise<WorkspaceRecoverySummary> {
    const workspaces = this.workspaceRepo.findActiveByProjectId(projectId);
    let activeCount = 0;
    let quarantinedCount = 0;
    let cleanedCount = 0;
    const quarantinedWorkspaces: string[] = [];

    for (const ws of workspaces) {
      const isStale = this.checkIfWorkspaceStale(ws);

      if (!isStale) {
        activeCount++;
        continue;
      }

      // Handle Stale / Abandoned Workspace
      try {
        const treeStatus = await this.worktreeManager.inspectWorkingTree(ws.worktreePath);
        
        // Check if there are committed or uncommitted changes against baseCommit
        let hasChanges = !treeStatus.isClean;
        let patch = "";
        try {
          const { stdout: patchOut } = await execAsync(`git diff "${ws.baseCommit}"`, {
            cwd: ws.worktreePath,
          });
          patch = patchOut.trim();
          if (patch.length > 0) hasChanges = true;
        } catch {
          // ignore diff error
        }

        if (hasChanges) {
          // Quarantine: Preserve changes into patch artifact
          const quarantineId = `quar_${randomUUID().slice(0, 12)}`;
          this.workspaceRepo.saveQuarantineRecord({
            id: quarantineId,
            workspaceId: ws.id,
            reason: `Abandoned workspace with uncommitted work (task: ${ws.taskId}, lease: ${ws.leaseId})`,
            patch,
            createdAt: new Date().toISOString(),
          });

          this.workspaceRepo.updateStatus(ws.id, "QUARANTINED", "LEASE_STALE_OR_EXPIRED");
          this.workspaceRepo.updateCleanupState(ws.id, "QUARANTINED");

          quarantinedCount++;
          quarantinedWorkspaces.push(ws.id);

          if (this.eventStore) {
            this.eventStore.append({
              id: randomUUID(),
              schemaVersion: 1,
              actor: "system",
              timestamp: new Date().toISOString(),
              type: EventTypes.WORKSPACE_QUARANTINED,
              projectId: ws.projectId,
              taskId: ws.taskId,
              agentId: ws.agentId,
              payload: {
                workspaceId: ws.id,
                quarantineId,
                reason: "LEASE_STALE_OR_EXPIRED",
                patchLength: patch.length,
              },
            });
          }
        } else {
          // Clean: Safely remove empty worktree
          await this.worktreeManager.removeWorktree(ws.worktreePath, repoPath, true);
          this.workspaceRepo.updateStatus(ws.id, "CLEANED");
          this.workspaceRepo.updateCleanupState(ws.id, "CLEANED");
          cleanedCount++;

          if (this.eventStore) {
            this.eventStore.append({
              id: randomUUID(),
              schemaVersion: 1,
              actor: "system",
              timestamp: new Date().toISOString(),
              type: EventTypes.WORKSPACE_CLEANED,
              projectId: ws.projectId,
              taskId: ws.taskId,
              agentId: ws.agentId,
              payload: {
                workspaceId: ws.id,
                reason: "STALE_CLEANUP",
              },
            });
          }
        }
      } catch {
        // In case worktree folder was manually deleted
        this.workspaceRepo.updateStatus(ws.id, "CLEANED");
        this.workspaceRepo.updateCleanupState(ws.id, "CLEANED");
        cleanedCount++;
      }
    }

    return {
      inspectedCount: workspaces.length,
      activeCount,
      quarantinedCount,
      cleanedCount,
      quarantinedWorkspaces,
    };
  }

  /**
   * Determine if a workspace's lease has expired or its generation token is stale.
   */
  private checkIfWorkspaceStale(ws: ExecutionWorkspace): boolean {
    if (!this.leaseRepo) return false;

    const lease = this.leaseRepo.findById(ws.leaseId);
    if (!lease) return true;

    if (lease.status !== "ACTIVE") return true;
    if (lease.generation !== ws.generation) return true;
    if (Date.now() > new Date(lease.expiresAt).getTime()) return true;

    return false;
  }
}
