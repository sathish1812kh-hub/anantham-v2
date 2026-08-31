import { randomUUID } from "node:crypto";
import {
  type ExecutionWorkspace,
  ExecutionWorkspaceSchema,
  type WorkspaceStatus,
} from "../domain/workspace.js";
import { EventTypes } from "../domain/event.js";
import { EventStore } from "../event-state/event-store.js";
import { WorkspaceRepository } from "../persistence/repositories/workspace-repository.js";
import { LeaseRepository } from "../persistence/repositories/lease-repository.js";
import { TaskClaimManager } from "../tasks/task-claim-manager.js";
import { GitWorktreeManager } from "./git-worktree-manager.js";

export interface AllocateWorkspaceRequest {
  projectId: string;
  taskId: string;
  agentId: string;
  instanceId: string;
  leaseId: string;
  generation: number;
  baseBranch?: string;
  repoPath?: string;
  metadata?: Record<string, unknown>;
}

export interface AllocateWorkspaceResult {
  success: boolean;
  workspace?: ExecutionWorkspace;
  errorCode?: string;
  errorMessage?: string;
}

export interface WorkspaceManagerOptions {
  workspaceRepo: WorkspaceRepository;
  leaseRepo?: LeaseRepository;
  claimManager?: TaskClaimManager;
  worktreeManager?: GitWorktreeManager;
  eventStore?: EventStore;
  maxActiveWorktreesPerProject?: number;
}

/**
 * Workspace Manager coordinating execution workspace allocation,
 * task lease binding, base revision capture, and concurrency bounds.
 * PRD Part 2 Section 52.
 */
export class WorkspaceManager {
  private readonly workspaceRepo: WorkspaceRepository;
  private readonly leaseRepo?: LeaseRepository;
  private readonly claimManager?: TaskClaimManager;
  private readonly worktreeManager: GitWorktreeManager;
  private readonly eventStore?: EventStore;
  private readonly maxActiveWorktreesPerProject: number;

  constructor(options: WorkspaceManagerOptions) {
    this.workspaceRepo = options.workspaceRepo;
    this.leaseRepo = options.leaseRepo;
    this.claimManager = options.claimManager;
    this.worktreeManager = options.worktreeManager ?? new GitWorktreeManager();
    this.eventStore = options.eventStore;
    this.maxActiveWorktreesPerProject = options.maxActiveWorktreesPerProject ?? 8;
  }

  /**
   * Allocate an isolated execution workspace for a claimed task.
   */
  public async allocateWorkspace(
    request: AllocateWorkspaceRequest
  ): Promise<AllocateWorkspaceResult> {
    const now = new Date().toISOString();

    // 1. Task Ownership & Lease Validation
    if (this.claimManager) {
      const isValid = this.claimManager.verifyOwnership(
        request.taskId,
        request.leaseId,
        request.generation,
        request.agentId
      );
      if (!isValid) {
        return {
          success: false,
          errorCode: "FENCING_OR_OWNERSHIP_INVALID",
          errorMessage: `Task "${request.taskId}" ownership verification failed for agent "${request.agentId}" (lease: "${request.leaseId}", gen: ${request.generation}).`,
        };
      }
    } else if (this.leaseRepo) {
      const activeLease = this.leaseRepo.findActiveByTaskId(request.taskId);
      if (
        !activeLease ||
        activeLease.id !== request.leaseId ||
        activeLease.generation !== request.generation ||
        activeLease.agentId !== request.agentId
      ) {
        return {
          success: false,
          errorCode: "FENCING_OR_OWNERSHIP_INVALID",
          errorMessage: `Active lease not found or generation mismatch for task "${request.taskId}".`,
        };
      }
    }

    // 2. Concurrency Limit Check per Project
    const activeWorkspaces = this.workspaceRepo.findActiveByProjectId(request.projectId);
    if (activeWorkspaces.length >= this.maxActiveWorktreesPerProject) {
      return {
        success: false,
        errorCode: "PROJECT_CONCURRENCY_LIMIT_EXCEEDED",
        errorMessage: `Project "${request.projectId}" reached maximum active worktree capacity (${this.maxActiveWorktreesPerProject}).`,
      };
    }

    // 3. Inspect Base Repository State & Capture Base Commit
    const repoPath = request.repoPath || process.cwd();
    let baseCommit: string;
    let baseBranch: string;

    try {
      const status = await this.worktreeManager.inspectWorkingTree(repoPath);
      baseCommit = status.headCommit;
      baseBranch = request.baseBranch || status.branch;
    } catch (err: any) {
      return {
        success: false,
        errorCode: "REPO_INSPECTION_FAILED",
        errorMessage: `Failed to inspect base repository at "${repoPath}": ${err.message}`,
      };
    }

    // 4. Create Worktree on isolated branch
    const workspaceId = `ws_${randomUUID().slice(0, 12)}`;
    const branchName = `anantham/${workspaceId}`;

    let worktreePath: string;
    try {
      const worktreeRes = await this.worktreeManager.createWorktree(
        workspaceId,
        branchName,
        baseCommit,
        repoPath
      );
      worktreePath = worktreeRes.worktreePath;
    } catch (err: any) {
      return {
        success: false,
        errorCode: "WORKTREE_ALLOCATION_FAILED",
        errorMessage: `Failed to create Git worktree: ${err.message}`,
      };
    }

    // 5. Persist Workspace Entity
    const workspace: ExecutionWorkspace = ExecutionWorkspaceSchema.parse({
      id: workspaceId,
      projectId: request.projectId,
      taskId: request.taskId,
      agentId: request.agentId,
      instanceId: request.instanceId,
      leaseId: request.leaseId,
      generation: request.generation,
      baseCommit,
      baseBranch,
      worktreePath,
      branchName,
      status: "READY",
      cleanupState: "NONE",
      metadata: request.metadata,
      createdAt: now,
      lastVerifiedAt: now,
    });

    this.workspaceRepo.save(workspace);

    // 6. Emit Audit Event
    if (this.eventStore) {
      this.eventStore.append({
        id: randomUUID(),
        schemaVersion: 1,
        actor: "system",
        timestamp: now,
        type: EventTypes.WORKSPACE_CREATED,
        projectId: request.projectId,
        taskId: request.taskId,
        agentId: request.agentId,
        payload: {
          workspaceId,
          leaseId: request.leaseId,
          generation: request.generation,
          baseCommit,
          worktreePath,
          branchName,
        },
      });
    }

    return {
      success: true,
      workspace,
    };
  }

  /**
   * Get workspace by ID.
   */
  public getWorkspace(workspaceId: string): ExecutionWorkspace | null {
    return this.workspaceRepo.findById(workspaceId);
  }

  /**
   * Update workspace status.
   */
  public updateStatus(
    workspaceId: string,
    status: WorkspaceStatus,
    quarantineReason?: string
  ): void {
    this.workspaceRepo.updateStatus(workspaceId, status, quarantineReason);
  }

  /**
   * Release and safely clean up workspace.
   */
  public async cleanupWorkspace(
    workspaceId: string,
    repoPath: string = process.cwd(),
    force: boolean = false
  ): Promise<boolean> {
    const ws = this.workspaceRepo.findById(workspaceId);
    if (!ws) return false;

    const removed = await this.worktreeManager.removeWorktree(ws.worktreePath, repoPath, force);
    if (removed) {
      this.workspaceRepo.updateStatus(workspaceId, "CLEANED");
      this.workspaceRepo.updateCleanupState(workspaceId, "CLEANED");

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
          payload: { workspaceId },
        });
      }
    }
    return removed;
  }
}
