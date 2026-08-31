import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { WorkspaceRepository } from "../../src/persistence/repositories/workspace-repository.js";
import { LeaseRepository } from "../../src/persistence/repositories/lease-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";
import { WorkspaceManager } from "../../src/execution/workspace-manager.js";
import { GitWorktreeManager } from "../../src/execution/git-worktree-manager.js";
import { createTempGitRepo, createProjectAndSession, type TempGitRepo } from "./git-test-helper.js";

describe("P6.4 Parallel Execution — Project Boundary Isolation", () => {
  let db: SqliteEngine;
  let workspaceRepo: WorkspaceRepository;
  let leaseRepo: LeaseRepository;
  let taskRepo: TaskRepository;
  let claimManager: TaskClaimManager;
  let worktreeManager: GitWorktreeManager;
  let workspaceManager: WorkspaceManager;
  let tempRepo: TempGitRepo;

  beforeEach(async () => {
    tempRepo = await createTempGitRepo();
    db = new SqliteEngine({ path: ":memory:" });
    db.open();
    const migrator = new MigrationEngine(db);
    migrator.migrate();

    createProjectAndSession(db, "proj_alpha", "sess_alpha");

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
      maxActiveWorktreesPerProject: 2,
    });
  });

  afterEach(() => {
    db.close();
    tempRepo.cleanup();
  });

  it("strictly isolates workspaces by project and enforces project concurrency limits", async () => {
    // 1. Create 3 tasks in Project Alpha
    for (let i = 1; i <= 3; i++) {
      taskRepo.save({
        id: `task_proj_iso_${i}`,
        sessionId: "sess_alpha",
        projectId: "proj_alpha",
        title: `Task ${i}`,
        description: "Iso task",
        objective: "Iso task",
        status: "queued",
        priority: "normal",
        targetFiles: [`src/f${i}.ts`],
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
    }

    const claim1 = claimManager.claimTask({
      taskId: "task_proj_iso_1",
      agentId: "agent_1",
      instanceId: "inst_1",
      projectId: "proj_alpha",
      sessionId: "sess_alpha",
    });
    const claim2 = claimManager.claimTask({
      taskId: "task_proj_iso_2",
      agentId: "agent_2",
      instanceId: "inst_2",
      projectId: "proj_alpha",
      sessionId: "sess_alpha",
    });
    const claim3 = claimManager.claimTask({
      taskId: "task_proj_iso_3",
      agentId: "agent_3",
      instanceId: "inst_3",
      projectId: "proj_alpha",
      sessionId: "sess_alpha",
    });

    const ws1 = await workspaceManager.allocateWorkspace({
      projectId: "proj_alpha",
      taskId: "task_proj_iso_1",
      agentId: "agent_1",
      instanceId: "inst_1",
      leaseId: claim1.lease!.id,
      generation: claim1.lease!.generation,
      repoPath: tempRepo.repoPath,
    });
    expect(ws1.success).toBe(true);

    const ws2 = await workspaceManager.allocateWorkspace({
      projectId: "proj_alpha",
      taskId: "task_proj_iso_2",
      agentId: "agent_2",
      instanceId: "inst_2",
      leaseId: claim2.lease!.id,
      generation: claim2.lease!.generation,
      repoPath: tempRepo.repoPath,
    });
    expect(ws2.success).toBe(true);

    // Third allocation in Project Alpha should exceed capacity limit (2)
    const ws3 = await workspaceManager.allocateWorkspace({
      projectId: "proj_alpha",
      taskId: "task_proj_iso_3",
      agentId: "agent_3",
      instanceId: "inst_3",
      leaseId: claim3.lease!.id,
      generation: claim3.lease!.generation,
      repoPath: tempRepo.repoPath,
    });
    expect(ws3.success).toBe(false);
    expect(ws3.errorCode).toBe("PROJECT_CONCURRENCY_LIMIT_EXCEEDED");

    // Clean up
    await workspaceManager.cleanupWorkspace(ws1.workspace!.id, tempRepo.repoPath, true);
    await workspaceManager.cleanupWorkspace(ws2.workspace!.id, tempRepo.repoPath, true);
  }, 25000);
});
