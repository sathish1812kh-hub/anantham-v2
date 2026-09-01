import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { LeaseRepository } from "../../src/persistence/repositories/lease-repository.js";
import { CrashRecoveryEngine } from "../../src/recovery/crash-recovery-engine.js";

describe("P9.2 Recovery — Repeated Recovery Idempotency", () => {
  let engine: SqliteEngine;
  let eventStore: EventStore;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let taskRepo: TaskRepository;
  let leaseRepo: LeaseRepository;
  let recoveryEngine: CrashRecoveryEngine;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    eventStore = new EventStore(engine);
    projectRepo = new ProjectRepository(engine);
    sessionRepo = new SessionRepository(engine);
    taskRepo = new TaskRepository(engine);
    leaseRepo = new LeaseRepository(engine);
    recoveryEngine = new CrashRecoveryEngine({ engine, eventStore });

    const now = new Date().toISOString();
    projectRepo.save({
      id: "proj_repeat",
      name: "Repeat Test Project",
      rootPath: "/tmp/repeat",
      status: "active",
      tags: [],
      modelProfile: "default",
      memoryNamespace: "default",
      orchestrationProfile: "default",
      trustProfile: "safe",
      createdAt: now,

      lastOpenedAt: now,
      lastActivityAt: now,
    });

    sessionRepo.save({
      id: "sess_repeat",
      projectId: "proj_repeat",
      name: "Repeat Session",
      branch: "main",
      status: "active",
      modelProfile: "default",
      keyPoolProfile: "default",
      mode: "interactive",
      permissions: {},
      createdAt: now,
      updatedAt: now,
    });
  });


  afterEach(() => {
    engine.close();
  });

  it("safely and idempotently executes multiple consecutive crash recovery cycles", async () => {
    const past = new Date(Date.now() - 60000).toISOString();


    taskRepo.save({
      id: "task_repeat_01",
      projectId: "proj_repeat",
      sessionId: "sess_repeat",
      objective: "Objective 1",
      status: "running",
      priority: "normal",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: past,
      updatedAt: past,
    });

    leaseRepo.save({
      id: "lease_repeat_01",
      taskId: "task_repeat_01",
      agentId: "agent_old",
      instanceId: "inst_old",
      projectId: "proj_repeat",
      sessionId: "sess_repeat",
      generation: 1,
      acquiredAt: past,
      expiresAt: past,
      lastHeartbeatAt: past,
      ttlMs: 30000,
      status: "ACTIVE",
      renewalCount: 0,
      maxRenewals: 10,
    });

    // Cycle 1
    const rec1 = await recoveryEngine.executeRecovery();
    expect(rec1.status).toBe("SUCCESS");
    expect(taskRepo.findById("task_repeat_01")?.status).toBe("queued");
    expect(leaseRepo.findById("lease_repeat_01")?.status).toBe("EXPIRED");

    // Cycle 2 (Immediately following Cycle 1)
    const rec2 = await recoveryEngine.executeRecovery();
    expect(rec2.status).toBe("SUCCESS");
    expect(taskRepo.findById("task_repeat_01")?.status).toBe("queued");
    expect(leaseRepo.findById("lease_repeat_01")?.status).toBe("EXPIRED");

    // Cycle 3 (Third consecutive run)
    const rec3 = await recoveryEngine.executeRecovery();
    expect(rec3.status).toBe("SUCCESS");
    expect(rec3.databaseIntegrityPassed).toBe(true);

  });
});
