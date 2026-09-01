import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { LeaseRepository } from "../../src/persistence/repositories/lease-repository.js";
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";
import { CrashRecoveryEngine } from "../../src/recovery/crash-recovery-engine.js";

describe("P9.2 Recovery — Interrupted Task Recovery & Re-Claiming", () => {
  let engine: SqliteEngine;
  let eventStore: EventStore;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let taskRepo: TaskRepository;
  let leaseRepo: LeaseRepository;
  let claimManager: TaskClaimManager;
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
    claimManager = new TaskClaimManager({ engine, taskRepo, leaseRepo, eventStore });
    recoveryEngine = new CrashRecoveryEngine({ engine, eventStore });

    const now = new Date().toISOString();
    projectRepo.save({
      id: "proj_rec_01",
      name: "Recovery Test Project",
      rootPath: "/tmp/rec",
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
      id: "sess_rec_01",
      projectId: "proj_rec_01",
      name: "Recovery Session",
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

  it("recovers an in-progress task interrupted by a crash and allows subsequent claim", async () => {
    const now = new Date().toISOString();

    const past = new Date(Date.now() - 60000).toISOString();

    // 1. Create a task that was running when crash happened
    taskRepo.save({

      id: "task_crashed_01",
      projectId: "proj_rec_01",
      sessionId: "sess_rec_01",
      objective: "Build component",
      status: "running",
      priority: "high",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: past,
      updatedAt: past,
    });

    // 2. Create an expired lease in SQLite
    leaseRepo.save({
      id: "lease_crashed_01",
      taskId: "task_crashed_01",
      agentId: "agent_dead_worker",
      instanceId: "inst_dead",
      projectId: "proj_rec_01",
      sessionId: "sess_rec_01",
      generation: 1,
      acquiredAt: past,
      expiresAt: past,
      lastHeartbeatAt: past,
      ttlMs: 30000,
      status: "ACTIVE",
      renewalCount: 0,
      maxRenewals: 10,
    });

    // Before recovery: task is stuck in 'running' and cannot be claimed
    const preClaim = claimManager.claimTask({
      taskId: "task_crashed_01",
      agentId: "agent_new_worker",
      instanceId: "inst_new",
      projectId: "proj_rec_01",
      sessionId: "sess_rec_01",
    });
    expect(preClaim.success).toBe(false);
    expect(preClaim.errorCode).toBe("TASK_NOT_CLAIMABLE");

    // 3. Run Crash Recovery Engine
    const recoveryRecord = await recoveryEngine.executeRecovery();
    expect(recoveryRecord.status).toBe("SUCCESS");

    expect(recoveryRecord.staleLeasesEvictedCount).toBeGreaterThanOrEqual(1);

    // 4. Verify task status was reset to 'queued' in SQLite
    const recoveredTask = taskRepo.findById("task_crashed_01");
    expect(recoveredTask).toBeDefined();
    expect(recoveredTask?.status).toBe("queued");

    // 5. Verify the task can now be successfully claimed by a new worker
    const postClaim = claimManager.claimTask({
      taskId: "task_crashed_01",
      agentId: "agent_new_worker",
      instanceId: "inst_new",
      projectId: "proj_rec_01",
      sessionId: "sess_rec_01",
    });

    expect(postClaim.success).toBe(true);
    expect(postClaim.lease).toBeDefined();
    expect(postClaim.lease?.agentId).toBe("agent_new_worker");
    expect(postClaim.lease?.generation).toBe(2); // Incremented generation fencing token
  });
});
