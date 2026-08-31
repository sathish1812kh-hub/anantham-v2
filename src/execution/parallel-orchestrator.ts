import { exec } from "node:child_process";
import { promisify } from "node:util";
import {
  type IntegrationRequest,
  type IntegrationResult,
} from "../domain/workspace.js";
import { WorkspaceManager, type AllocateWorkspaceRequest, type AllocateWorkspaceResult } from "./workspace-manager.js";
import { WorkspaceIntegrator } from "./workspace-integrator.js";
import { WorkspaceRepository } from "../persistence/repositories/workspace-repository.js";

const execAsync = promisify(exec);

export interface ParallelOrchestratorOptions {
  workspaceManager: WorkspaceManager;
  workspaceIntegrator: WorkspaceIntegrator;
  workspaceRepo: WorkspaceRepository;
}

/**
 * Parallel Execution Orchestrator.
 * Coordinates multi-agent parallel workspaces and handles deterministic
 * serialization fallback when conflicts are detected.
 * PRD Part 2 Section 52, Section 55.
 */
export class ParallelOrchestrator {
  private readonly workspaceManager: WorkspaceManager;
  private readonly workspaceIntegrator: WorkspaceIntegrator;
  private readonly workspaceRepo: WorkspaceRepository;

  constructor(options: ParallelOrchestratorOptions) {
    this.workspaceManager = options.workspaceManager;
    this.workspaceIntegrator = options.workspaceIntegrator;
    this.workspaceRepo = options.workspaceRepo;
  }

  /**
   * Spawn an isolated parallel workspace for a task claim.
   */
  public async spawnParallelWorkspace(
    request: AllocateWorkspaceRequest
  ): Promise<AllocateWorkspaceResult> {
    return this.workspaceManager.allocateWorkspace(request);
  }

  /**
   * Attempt integration with automatic serialization fallback on conflict.
   */
  public async integrateWithSerializationFallback(
    request: IntegrationRequest,
    repoPath: string = process.cwd()
  ): Promise<IntegrationResult> {
    // 1. Initial Integration Attempt
    const result = await this.workspaceIntegrator.integrate(request, repoPath);

    // If clean or fatal non-conflict failure, return directly
    if (result.success || result.status !== "CONFLICT_REJECTED") {
      return result;
    }

    // 2. Serialization Fallback: Rebase workspace onto current target branch
    const ws = this.workspaceRepo.findById(request.workspaceId);
    if (!ws) return result;

    try {
      // Rebase worktree branch on updated target commit
      const { stdout: targetHeadOut } = await execAsync("git rev-parse HEAD", { cwd: repoPath });
      const targetHead = targetHeadOut.trim();

      await execAsync(`git rebase "${targetHead}"`, { cwd: ws.worktreePath });

      // Update workspace base commit
      ws.baseCommit = targetHead;
      this.workspaceRepo.save(ws);

      // 3. Retry integration after rebase
      return await this.workspaceIntegrator.integrate(request, repoPath);
    } catch {
      // If rebase fails or conflicts persist, fail closed
      return result;
    }
  }

  /**
   * Safe cleanup of completed workspace.
   */
  public async cleanup(
    workspaceId: string,
    repoPath: string = process.cwd()
  ): Promise<boolean> {
    return this.workspaceManager.cleanupWorkspace(workspaceId, repoPath);
  }
}
