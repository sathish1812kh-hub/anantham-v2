import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository, SessionRepository, TaskRepository, LeaseRepository } from "../../src/persistence/index.js";
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";
import { StalledAgentRecoveryEngine } from "../../src/tasks/stalled-agent-recovery.js";
import { Task } from "../../src/domain/task.js";

describe("P6.2 Tasks — Ownership Fencing & Generation Protection", () => {
  let db: SqliteEngine;
  let taskRepo: TaskRepository;
  let leaseRepo: LeaseRepository;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let claimManager: TaskClaimManager;
  let recoveryEngine: StalledAgentRecoveryEngine;

  beforeEach(() => {
    db = new SqliteEngine({ path: ":memory:" });
    db.open();
    const migrator = new MigrationEngine(db);
    migrator.migrate();

    projectRepo = new ProjectRepository(db);
    sessionRepo = new SessionRepository(db);
    taskRepo = new TaskRepository(db);
    leaseRepo = new LeaseRepository(db);

    claimManager = new TaskClaimManager({
      engine: db,
      taskRepo,
      leaseRepo,
    });

    recoveryEngine = new StalledAgentRecoveryEngine({
      engine: db,
      taskRepo,
      leaseRepo,
    });

    projectRepo.save({
      id: "proj_fence",
      name: "Fencing Project",
      rootPath: "C:/fence_proj",
      status: "active",
      tags: [],
      modelProfile: "m",
      memoryNamespace: "mem",
      orchestrationProfile: "o",
      trustProfile: "developer",
      createdAt: "2026-08-31T00:00:00.000Z",
      lastOpenedAt: "2026-08-31T00:00:00.000Z",
      lastActivityAt: "2026-08-31T00:00:00.000Z",
    });

    sessionRepo.save({
      id: "sess_fence",
      projectId: "proj_fence",
      name: "Fencing Session",
      branch: "main",
      status: "active",
      modelProfile: "m",
      keyPoolProfile: "k",
      mode: "interactive",
      permissions: {},
      createdAt: "2026-08-31T00:00:00.000Z",
      updatedAt: "2026-08-31T00:00:00.000Z",
    });
  });

  afterEach(() => {
    db.close();
  });

  it("fences stale agent writes when a task has been reclaimed and bumped to a new generation", () => {
    const task: Task = {
      id: "task_fence_01",
      projectId: "proj_fence",
      sessionId: "sess_fence",
      objective: "Fencing test task",
      status: "queued",
      priority: "high",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: "2026-08-31T00:01:00.000Z",
      updatedAt: "2026-08-31T00:01:00.000Z",
    };
    taskRepo.save(task);

    // 1. Agent A claims task (Generation 1)
    const claimA = claimManager.claimTask({
      taskId: "task_fence_01",
      agentId: "agent_A",
      instanceId: "inst_A_01",
      projectId: "proj_fence",
      sessionId: "sess_fence",
      ttlMs: 5000,
    });
    expect(claimA.success).toBe(true);
    const leaseA = claimA.lease!;
    expect(leaseA.generation).toBe(1);

    // 2. Agent A stalls, time advances past expiry -> Recovery sweeps and reclaims
    const futureTime = new Date(Date.now() + 10000).toISOString();
    const recoveryRecords = recoveryEngine.recoverStalledLeases({ nowIso: futureTime });
    expect(recoveryRecords).toHaveLength(1);
    expect(recoveryRecords[0]?.action).toBe("RECLAIM_AND_REQUEUE");

    // 3. Agent B claims task (Generation 2)
    const claimB = claimManager.claimTask({
      taskId: "task_fence_01",
      agentId: "agent_B",
      instanceId: "inst_B_01",
      projectId: "proj_fence",
      sessionId: "sess_fence",
      ttlMs: 30000,
    });
    expect(claimB.success).toBe(true);
    const leaseB = claimB.lease!;
    expect(leaseB.generation).toBe(2);

    // 4. Stale Agent A wakes up and attempts heartbeat with Generation 1 -> Fails FENCING_VIOLATION
    const hbStale = claimManager.heartbeat({
      leaseId: leaseA.id,
      agentId: "agent_A",
      instanceId: "inst_A_01",
      generation: 1,
    });
    expect(hbStale.success).toBe(false);

    // 5. Stale Agent A attempts to complete task with Generation 1 -> Fails ownership check
    const completeStale = claimManager.completeTask(
      "task_fence_01",
      leaseA.id,
      1,
      { output: "Stale write" }
    );
    expect(completeStale).toBe(false);

    // 6. Valid Agent B completes task with Generation 2 -> Succeeds
    const completeValid = claimManager.completeTask(
      "task_fence_01",
      leaseB.id,
      2,
      { output: "Valid write" }
    );
    expect(completeValid).toBe(true);
  });
});
