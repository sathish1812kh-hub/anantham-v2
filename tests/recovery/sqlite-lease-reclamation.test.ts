import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { LeaseRepository } from "../../src/persistence/repositories/lease-repository.js";
import { CrashRecoveryEngine } from "../../src/recovery/crash-recovery-engine.js";

describe("P9.2 Recovery — Persistent SQLite Lease Reclamation", () => {
  let engine: SqliteEngine;
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

    projectRepo = new ProjectRepository(engine);
    sessionRepo = new SessionRepository(engine);
    taskRepo = new TaskRepository(engine);
    leaseRepo = new LeaseRepository(engine);
    recoveryEngine = new CrashRecoveryEngine({ engine });

    const now = new Date().toISOString();
    projectRepo.save({
      id: "proj_01",
      name: "Test Project",
      rootPath: "/tmp/test",
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
      id: "sess_01",
      projectId: "proj_01",
      name: "Test Session",
      branch: "main",
      status: "active",
      modelProfile: "default",
      keyPoolProfile: "default",
      mode: "interactive",
      permissions: {},
      createdAt: now,
      updatedAt: now,
    });

    taskRepo.save({
      id: "task_01",
      projectId: "proj_01",
      sessionId: "sess_01",
      objective: "Task 1",
      status: "running",
      priority: "normal",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: now,
      updatedAt: now,
    });

    taskRepo.save({
      id: "task_02",
      projectId: "proj_01",
      sessionId: "sess_01",
      objective: "Task 2",
      status: "running",
      priority: "normal",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: now,
      updatedAt: now,
    });
  });


  afterEach(() => {
    engine.close();
  });

  it("reclaims expired persistent leases from the SQLite database while preserving active ones", async () => {
    const past = new Date(Date.now() - 50000).toISOString();

    const future = new Date(Date.now() + 50000).toISOString();

    // 1. Save an expired active lease in SQLite
    leaseRepo.save({
      id: "lease_expired_db_01",
      taskId: "task_01",
      agentId: "agent_old",
      instanceId: "inst_old",
      projectId: "proj_01",
      sessionId: "sess_01",
      generation: 1,
      acquiredAt: past,
      expiresAt: past,
      lastHeartbeatAt: past,
      ttlMs: 30000,
      status: "ACTIVE",
      renewalCount: 0,
      maxRenewals: 10,
    });

    // 2. Save a valid, unexpired active lease in SQLite
    leaseRepo.save({
      id: "lease_valid_db_02",
      taskId: "task_02",
      agentId: "agent_active",
      instanceId: "inst_active",
      projectId: "proj_01",
      sessionId: "sess_01",
      generation: 1,
      acquiredAt: new Date().toISOString(),
      expiresAt: future,
      lastHeartbeatAt: new Date().toISOString(),
      ttlMs: 30000,
      status: "ACTIVE",
      renewalCount: 0,
      maxRenewals: 10,
    });

    // 3. Execute Crash Recovery Engine
    const recoveryRecord = await recoveryEngine.executeRecovery();
    expect(recoveryRecord.staleLeasesEvictedCount).toBeGreaterThanOrEqual(1);


    // 4. Verify SQLite states
    const expiredLease = leaseRepo.findById("lease_expired_db_01");
    expect(expiredLease?.status).toBe("EXPIRED");

    const validLease = leaseRepo.findById("lease_valid_db_02");
    expect(validLease?.status).toBe("ACTIVE");
  });
});
