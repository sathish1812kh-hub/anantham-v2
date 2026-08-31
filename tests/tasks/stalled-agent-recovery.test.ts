import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository, SessionRepository, TaskRepository, LeaseRepository } from "../../src/persistence/index.js";
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";
import { StalledAgentRecoveryEngine } from "../../src/tasks/stalled-agent-recovery.js";
import { Task } from "../../src/domain/task.js";

describe("P6.2 Tasks — Stalled Agent Recovery Pipeline", () => {
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
      defaultMaxAttempts: 3,
    });

    projectRepo.save({
      id: "proj_rec",
      name: "Recovery Project",
      rootPath: "C:/rec_proj",
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
      id: "sess_rec",
      projectId: "proj_rec",
      name: "Recovery Session",
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

  it("reclaims task when under max attempts, and fails task when max attempts exceeded", () => {
    const task: Task = {
      id: "task_retry_bound",
      projectId: "proj_rec",
      sessionId: "sess_rec",
      objective: "Bounded retry task",
      status: "queued",
      priority: "high",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: "2026-08-31T00:01:00.000Z",
      updatedAt: "2026-08-31T00:01:00.000Z",
    };
    taskRepo.save(task);

    // Attempt 1: Claim and Stall
    claimManager.claimTask({
      taskId: "task_retry_bound",
      agentId: "agent_1",
      instanceId: "inst_1",
      projectId: "proj_rec",
      sessionId: "sess_rec",
      ttlMs: 5000,
    });
    let futureTime = new Date(Date.now() + 10000).toISOString();
    let records = recoveryEngine.recoverStalledLeases({ nowIso: futureTime, maxAttempts: 3 });
    expect(records[0]?.action).toBe("RECLAIM_AND_REQUEUE");
    expect(taskRepo.findById("task_retry_bound")?.status).toBe("queued");

    // Attempt 2: Claim and Stall
    claimManager.claimTask({
      taskId: "task_retry_bound",
      agentId: "agent_2",
      instanceId: "inst_2",
      projectId: "proj_rec",
      sessionId: "sess_rec",
      ttlMs: 5000,
    });
    futureTime = new Date(Date.now() + 20000).toISOString();
    records = recoveryEngine.recoverStalledLeases({ nowIso: futureTime, maxAttempts: 3 });
    expect(records[0]?.action).toBe("RECLAIM_AND_REQUEUE");
    expect(taskRepo.findById("task_retry_bound")?.status).toBe("queued");

    // Attempt 3: Claim and Stall -> Exceeds maxAttempts (3)
    claimManager.claimTask({
      taskId: "task_retry_bound",
      agentId: "agent_3",
      instanceId: "inst_3",
      projectId: "proj_rec",
      sessionId: "sess_rec",
      ttlMs: 5000,
    });
    futureTime = new Date(Date.now() + 30000).toISOString();
    records = recoveryEngine.recoverStalledLeases({ nowIso: futureTime, maxAttempts: 3 });
    expect(records[0]?.action).toBe("FAIL");

    const finalTask = taskRepo.findById("task_retry_bound");
    expect(finalTask?.status).toBe("failed");
    expect(finalTask?.metadata?.failureReason).toBe("STALLED_AGENT_MAX_RETRIES_EXCEEDED");
  });
});
