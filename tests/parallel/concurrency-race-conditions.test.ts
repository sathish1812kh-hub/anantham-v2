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

describe("P6.4 Parallel Execution — Concurrency Race Conditions", () => {
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

    createProjectAndSession(db, "proj_race", "sess_race");

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

  it("handles simultaneous workspace allocation requests across multiple concurrent agents", async () => {
    const agentCount = 4;
    const claims = [];
    for (let i = 1; i <= agentCount; i++) {
      taskRepo.save({
        id: `task_race_${i}`,
        sessionId: "sess_race",
        projectId: "proj_race",
        title: `Race Task ${i}`,
        description: "Concurrent allocation",
        objective: "Concurrent allocation",
        status: "queued",
        priority: "high",
        targetFiles: [`src/file_${i}.ts`],
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
        taskId: `task_race_${i}`,
        agentId: `agent_racer_${i}`,
        instanceId: `inst_racer_${i}`,
        projectId: "proj_race",
        sessionId: "sess_race",
      });
      claims.push(claim);
    }

    // Allocate 4 workspaces concurrently
    const promises = claims.map((claim, idx) =>
      workspaceManager.allocateWorkspace({
        projectId: "proj_race",
        taskId: `task_race_${idx + 1}`,
        agentId: `agent_racer_${idx + 1}`,
        instanceId: `inst_racer_${idx + 1}`,
        leaseId: claim.lease!.id,
        generation: claim.lease!.generation,
        repoPath: tempRepo.repoPath,
      })
    );

    const results = await Promise.all(promises);
    for (const res of results) {
      expect(res.success).toBe(true);
      expect(res.workspace?.id).toBeDefined();
    }

    // Clean up
    for (const res of results) {
      await workspaceManager.cleanupWorkspace(res.workspace!.id, tempRepo.repoPath, true);
    }
  }, 25000);
});
