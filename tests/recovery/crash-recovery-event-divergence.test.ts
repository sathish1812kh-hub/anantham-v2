import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { LeaseRepository } from "../../src/persistence/repositories/lease-repository.js";
import { CrashRecoveryEngine } from "../../src/recovery/crash-recovery-engine.js";

describe("W-P10.6-03: Crash Recovery Deterministic Lease and Task Reclamation", () => {
  let tempDir: string;
  let engine: SqliteEngine;
  let eventStore: EventStore;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let taskRepo: TaskRepository;
  let leaseRepo: LeaseRepository;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "anantham-crash-rec-evt-"));
    const dbPath = join(tempDir, "test.db");
    engine = new SqliteEngine({ path: dbPath });
    engine.open();

    const migrationEngine = new MigrationEngine(engine);
    migrationEngine.migrate();

    eventStore = new EventStore(engine);
    projectRepo = new ProjectRepository(engine);
    sessionRepo = new SessionRepository(engine);
    taskRepo = new TaskRepository(engine);
    leaseRepo = new LeaseRepository(engine);
  });

  afterEach(() => {
    engine.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("deterministically evicts expired leases and resets uncommitted interrupted tasks to queued state", async () => {
    const now = new Date();
    const past = new Date(now.getTime() - 60000).toISOString();

    projectRepo.save({
      id: "proj_01",
      name: "Test Project",
      rootPath: tempDir,
      status: "active",
      tags: [],
      modelProfile: "claude-3-5-sonnet",
      memoryNamespace: "project/proj_01",
      orchestrationProfile: "default",
      trustProfile: "developer",
      createdAt: past,
      lastOpenedAt: past,
      lastActivityAt: past,
    });

    sessionRepo.save({
      id: "sess_01",
      projectId: "proj_01",
      name: "Recovery Test Session",
      branch: "main",
      status: "active",
      modelProfile: "claude-3-5-sonnet",
      keyPoolProfile: "default",
      mode: "interactive",
      permissions: { "filesystem:read": true },
      createdAt: past,
      updatedAt: past,
    });

    // Seed task
    taskRepo.save({
      id: "task_interrupted_01",
      sessionId: "sess_01",
      projectId: "proj_01",
      objective: "Interrupted Task",
      status: "running",
      priority: "high",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: past,
      updatedAt: past,
    });

    // Seed an expired lease
    leaseRepo.save({
      id: "lease_expired_01",
      taskId: "task_interrupted_01",
      agentId: "agent_01",
      instanceId: "inst_01",
      projectId: "proj_01",
      sessionId: "sess_01",
      generation: 1,
      acquiredAt: past,
      expiresAt: past,
      lastHeartbeatAt: past,
      ttlMs: 1000,
      status: "ACTIVE",
      renewalCount: 0,
      maxRenewals: 5,
    });

    const recoveryEngine = new CrashRecoveryEngine({
      engine,
      eventStore,
    });

    const recoveryRecord = await recoveryEngine.executeRecovery();
    expect(recoveryRecord.status).toBe("SUCCESS");
    expect(recoveryRecord.staleLeasesEvictedCount).toBe(1);

    // Verify SQLite task was reset
    const task = taskRepo.findById("task_interrupted_01");
    expect(task?.status).toBe("queued");

    // Verify lease was set to EXPIRED
    const lease = leaseRepo.findById("lease_expired_01");
    expect(lease?.status).toBe("EXPIRED");
  });
});
