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

describe("P6.4 Parallel Execution — Base Revision Capture", () => {
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

    createProjectAndSession(db, "proj_base", "sess_base");

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
  });

  afterEach(() => {
    db.close();
    tempRepo.cleanup();
  });

  it("accurately captures the exact base commit SHA and base branch from the Git repository", async () => {
    taskRepo.save({
      id: "task_base_01",
      sessionId: "sess_base",
      projectId: "proj_base",
      title: "Base Capture Task",
      description: "Capture base commit",
      objective: "Capture base commit",
      status: "queued",
      priority: "normal",
      targetFiles: ["README.md"],
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

    const claim = claimManager.claimTask({
      taskId: "task_base_01",
      agentId: "agent_base_01",
      instanceId: "inst_base_01",
      projectId: "proj_base",
      sessionId: "sess_base",
    });

    const wsRes = await workspaceManager.allocateWorkspace({
      projectId: "proj_base",
      taskId: "task_base_01",
      agentId: "agent_base_01",
      instanceId: "inst_base_01",
      leaseId: claim.lease!.id,
      generation: claim.lease!.generation,
      repoPath: tempRepo.repoPath,
    });

    expect(wsRes.success).toBe(true);
    expect(wsRes.workspace?.baseCommit).toBe(tempRepo.initialCommit);
    expect(wsRes.workspace?.baseBranch).toBe("main");

    // Clean up
    await workspaceManager.cleanupWorkspace(wsRes.workspace!.id, tempRepo.repoPath, true);
  });
});
