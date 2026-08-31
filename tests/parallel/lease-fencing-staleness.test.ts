import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { WorkspaceRepository } from "../../src/persistence/repositories/workspace-repository.js";
import { LeaseRepository } from "../../src/persistence/repositories/lease-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";
import { WorkspaceManager } from "../../src/execution/workspace-manager.js";
import { WorkspaceIntegrator } from "../../src/execution/workspace-integrator.js";
import { GitWorktreeManager } from "../../src/execution/git-worktree-manager.js";
import { createTempGitRepo, createProjectAndSession, type TempGitRepo } from "./git-test-helper.js";

describe("P6.4 Parallel Execution — Lease Fencing & Stale Generation Token", () => {
  let db: SqliteEngine;
  let workspaceRepo: WorkspaceRepository;
  let leaseRepo: LeaseRepository;
  let taskRepo: TaskRepository;
  let claimManager: TaskClaimManager;
  let worktreeManager: GitWorktreeManager;
  let workspaceManager: WorkspaceManager;
  let integrator: WorkspaceIntegrator;
  let tempRepo: TempGitRepo;

  beforeEach(async () => {
    tempRepo = await createTempGitRepo();
    db = new SqliteEngine({ path: ":memory:" });
    db.open();
    const migrator = new MigrationEngine(db);
    migrator.migrate();

    createProjectAndSession(db, "proj_fence", "sess_fence");

    workspaceRepo = new WorkspaceRepository(db);
    leaseRepo = new LeaseRepository(db);
    taskRepo = new TaskRepository(db);
    claimManager = new TaskClaimManager({ engine: db, taskRepo, leaseRepo });
    worktreeManager = new GitWorktreeManager({ projectRoot: tempRepo.repoPath });
    workspaceManager = new WorkspaceManager({
      workspaceRepo,
      leaseRepo,
      claimManager,
      worktreeManager,
    });
    integrator = new WorkspaceIntegrator({
      workspaceRepo,
      claimManager,
      worktreeManager,
    });
  });

  afterEach(() => {
    db.close();
    tempRepo.cleanup();
  });

  it("strictly fences and rejects integration from an agent with a stale generation token", async () => {
    // 1. Task created
    taskRepo.save({
      id: "task_fencing_test",
      sessionId: "sess_fence",
      projectId: "proj_fence",
      title: "Fencing Task",
      description: "Test fencing token",
      objective: "Test fencing token",
      status: "queued",
      priority: "high",
      targetFiles: ["src/code.ts"],
      readOnlyFiles: [],
      dependencies: [],
      subtasks: [],
      inputArtifacts: [],
      outputArtifacts: [],
      assignedAgent: null,
      contextBudgetTokens: 10000,
      modelProfile: "default",
      requiredCapabilities: [],
      acceptanceCriteria: [],
      retryCount: 0,
      maxRetries: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 2. Agent A claims task (Generation 1) and allocates workspace
    const claimA = claimManager.claimTask({
      taskId: "task_fencing_test",
      agentId: "agent_A",
      instanceId: "inst_A",
      projectId: "proj_fence",
      sessionId: "sess_fence",
    });

    const wsA = await workspaceManager.allocateWorkspace({
      projectId: "proj_fence",
      taskId: "task_fencing_test",
      agentId: "agent_A",
      instanceId: "inst_A",
      leaseId: claimA.lease!.id,
      generation: claimA.lease!.generation,
      repoPath: tempRepo.repoPath,
    });

    // 3. Stalled / Reclaimed: Task is reclaimed by Agent B (Generation 2)
    claimManager.releaseTask({
      taskId: "task_fencing_test",
      leaseId: claimA.lease!.id,
      generation: 1,
      reason: "RECLAIMED",
    });

    const claimB = claimManager.claimTask({
      taskId: "task_fencing_test",
      agentId: "agent_B",
      instanceId: "inst_B",
      projectId: "proj_fence",
      sessionId: "sess_fence",
    });
    expect(claimB.lease!.generation).toBe(2);

    // 4. Agent A tries to integrate with stale Generation 1
    const staleIntRes = await integrator.integrate({
      workspaceId: wsA.workspace!.id,
      taskId: "task_fencing_test",
      agentId: "agent_A",
      instanceId: "inst_A",
      leaseId: claimA.lease!.id,
      generation: 1,
      targetBranch: "main",
      runVerification: false,
    }, tempRepo.repoPath);

    expect(staleIntRes.success).toBe(false);
    expect(staleIntRes.status).toBe("FENCING_VIOLATION");
    expect(staleIntRes.errorMessage).toContain("Stale ownership fencing token");

    // Clean up
    await workspaceManager.cleanupWorkspace(wsA.workspace!.id, tempRepo.repoPath, true);
  });
});
