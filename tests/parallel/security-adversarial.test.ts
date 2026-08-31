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

describe("P6.4 Parallel Execution — Adversarial Security Tests", () => {
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

    createProjectAndSession(db, "proj_sec", "sess_sec");

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

  it("blocks path traversal attempts in workspace IDs", () => {
    expect(() => {
      worktreeManager.getWorktreePath("../../etc/passwd");
    }).toThrow();
  });

  it("rejects workspace allocation when non-existent or forged lease ID is provided", async () => {
    taskRepo.save({
      id: "task_adv_sec",
      sessionId: "sess_sec",
      projectId: "proj_sec",
      title: "Adversarial Task",
      description: "Forged lease attack",
      objective: "Forged lease attack",
      status: "queued",
      priority: "high",
      targetFiles: ["src/sec.ts"],
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

    const forgedRes = await workspaceManager.allocateWorkspace({
      projectId: "proj_sec",
      taskId: "task_adv_sec",
      agentId: "agent_attacker",
      instanceId: "inst_attacker",
      leaseId: "forged_lease_id",
      generation: 1,
      repoPath: tempRepo.repoPath,
    });

    expect(forgedRes.success).toBe(false);
    expect(forgedRes.errorCode).toBe("FENCING_OR_OWNERSHIP_INVALID");
  });
});
