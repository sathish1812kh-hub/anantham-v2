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
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("P6.4 Parallel Execution — Crash / Restart Recovery & WAL Persistence", () => {
  let dbPath: string;
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
    dbPath = path.join(os.tmpdir(), `anantham-par-crash-${Date.now()}.db`);
    db = new SqliteEngine({ path: dbPath });
    db.open();
    const migrator = new MigrationEngine(db);
    migrator.migrate();

    createProjectAndSession(db, "proj_crash", "sess_crash");

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
    try {
      fs.rmSync(dbPath, { force: true });
    } catch {
      // ignore
    }
  });

  it("persists workspace records to SQLite WAL and fully reconstructs state across a process restart", async () => {
    // 1. Create task and allocate workspace
    taskRepo.save({
      id: "task_crash_01",
      sessionId: "sess_crash",
      projectId: "proj_crash",
      title: "Crash Recovery Task",
      description: "Persist across restart",
      objective: "Persist across restart",
      status: "queued",
      priority: "high",
      targetFiles: ["src/crash.ts"],
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
      taskId: "task_crash_01",
      agentId: "agent_crash_01",
      instanceId: "inst_crash_01",
      projectId: "proj_crash",
      sessionId: "sess_crash",
    });

    const wsRes = await workspaceManager.allocateWorkspace({
      projectId: "proj_crash",
      taskId: "task_crash_01",
      agentId: "agent_crash_01",
      instanceId: "inst_crash_01",
      leaseId: claim.lease!.id,
      generation: claim.lease!.generation,
      repoPath: tempRepo.repoPath,
    });
    expect(wsRes.success).toBe(true);
    const workspaceId = wsRes.workspace!.id;

    // 2. Simulate Process Crash (close database connection)
    db.close();

    // 3. Restart process (open new SqliteEngine with same file)
    const newDb = new SqliteEngine({ path: dbPath });
    newDb.open();
    const newWorkspaceRepo = new WorkspaceRepository(newDb);

    const recoveredWs = newWorkspaceRepo.findById(workspaceId);
    expect(recoveredWs).not.toBeNull();
    expect(recoveredWs?.id).toBe(workspaceId);
    expect(recoveredWs?.projectId).toBe("proj_crash");
    expect(recoveredWs?.taskId).toBe("task_crash_01");
    expect(recoveredWs?.baseCommit).toBe(tempRepo.initialCommit);
    expect(recoveredWs?.status).toBe("READY");

    newDb.close();

    // Clean up worktree
    await worktreeManager.removeWorktree(wsRes.workspace!.worktreePath, tempRepo.repoPath, true);
  });
});
