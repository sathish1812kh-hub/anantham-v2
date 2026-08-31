import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository, SessionRepository, TaskRepository, LeaseRepository } from "../../src/persistence/index.js";
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";
import { Task } from "../../src/domain/task.js";

describe("P6.2 Tasks — Heartbeat Renewals & Bounds", () => {
  let db: SqliteEngine;
  let taskRepo: TaskRepository;
  let leaseRepo: LeaseRepository;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let claimManager: TaskClaimManager;

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

    projectRepo.save({
      id: "proj_hb",
      name: "Heartbeat Project",
      rootPath: "C:/hb_proj",
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
      id: "sess_hb",
      projectId: "proj_hb",
      name: "Heartbeat Session",
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

  it("enforces max renewals bounds and rejects heartbeats from mismatched agent instances", () => {
    const task: Task = {
      id: "task_hb_01",
      projectId: "proj_hb",
      sessionId: "sess_hb",
      objective: "Heartbeat test",
      status: "queued",
      priority: "normal",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: "2026-08-31T00:01:00.000Z",
      updatedAt: "2026-08-31T00:01:00.000Z",
    };
    taskRepo.save(task);

    const claimRes = claimManager.claimTask({
      taskId: "task_hb_01",
      agentId: "agent_runner",
      instanceId: "inst_run_01",
      projectId: "proj_hb",
      sessionId: "sess_hb",
      ttlMs: 10000,
      maxRenewals: 2,
    });
    expect(claimRes.success).toBe(true);
    const lease = claimRes.lease!;

    // 1. Mismatched instance rejection
    const invalidInstHb = claimManager.heartbeat({
      leaseId: lease.id,
      agentId: "agent_runner",
      instanceId: "inst_wrong_instance",
      generation: lease.generation,
    });
    expect(invalidInstHb.success).toBe(false);
    expect(invalidInstHb.errorCode).toBe("OWNERSHIP_MISMATCH");

    // 2. Renewal 1 (Success)
    const hb1 = claimManager.heartbeat({
      leaseId: lease.id,
      agentId: "agent_runner",
      instanceId: "inst_run_01",
      generation: lease.generation,
    });
    expect(hb1.success).toBe(true);
    expect(hb1.lease?.renewalCount).toBe(1);

    // 3. Renewal 2 (Success)
    const hb2 = claimManager.heartbeat({
      leaseId: lease.id,
      agentId: "agent_runner",
      instanceId: "inst_run_01",
      generation: lease.generation,
    });
    expect(hb2.success).toBe(true);
    expect(hb2.lease?.renewalCount).toBe(2);

    // 4. Renewal 3 (Reaches maxRenewals limit of 2) -> Fails
    const hb3 = claimManager.heartbeat({
      leaseId: lease.id,
      agentId: "agent_runner",
      instanceId: "inst_run_01",
      generation: lease.generation,
    });
    expect(hb3.success).toBe(false);
    expect(hb3.errorCode).toBe("MAX_RENEWALS_EXCEEDED");
  });
});
