import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { CheckpointRepository } from "../../src/persistence/repositories/checkpoint-repository.js";
import { ArtifactRepository } from "../../src/persistence/repositories/artifact-repository.js";
import { EventRepository } from "../../src/persistence/repositories/event-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { ProjectionManager } from "../../src/event-state/projections/projection-manager.js";
import { SessionSummaryProjection } from "../../src/event-state/projections/session-summary-projection.js";
import { TaskBoardProjection } from "../../src/event-state/projections/task-board-projection.js";
import { LeaseManager } from "../../src/recovery/lease-manager.js";
import { CrashRecoveryEngine } from "../../src/recovery/crash-recovery-engine.js";
import { CheckpointManifestBuilder } from "../../src/recovery/checkpoint-manifest.js";

describe("Recovery Subsystem — CrashRecoveryEngine", () => {
  let tmpDir: string;
  let dbPath: string;
  let engine: SqliteEngine;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let taskRepo: TaskRepository;
  let checkpointRepo: CheckpointRepository;
  let artifactRepo: ArtifactRepository;
  let eventRepo: EventRepository;
  let eventStore: EventStore;
  let projectionManager: ProjectionManager;
  let leaseManager: LeaseManager;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "anantham-crash-test-"));
    dbPath = join(tmpDir, "crash-recovery-test.db");
    engine = new SqliteEngine({ path: dbPath });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    projectRepo = new ProjectRepository(engine);
    sessionRepo = new SessionRepository(engine);
    taskRepo = new TaskRepository(engine);
    checkpointRepo = new CheckpointRepository(engine);
    artifactRepo = new ArtifactRepository(engine);
    eventRepo = new EventRepository(engine);
    eventStore = new EventStore(engine);

    projectionManager = new ProjectionManager(eventStore);

    leaseManager = new LeaseManager({ taskRepo, defaultTtlMs: 50 });

    projectRepo.save({
      id: "proj_rec_01",
      name: "Recovery Test Project",
      rootPath: "/tmp/rec",
      status: "active",
      tags: ["testing"],
      modelProfile: "claude-3-5-sonnet",
      memoryNamespace: "project/proj_rec_01",
      orchestrationProfile: "default",
      trustProfile: "developer",
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    });

    sessionRepo.save({
      id: "sess_rec_01",
      projectId: "proj_rec_01",
      name: "Recovery Test Session",
      branch: "main",
      status: "active",
      modelProfile: "claude-3-5-sonnet",
      keyPoolProfile: "default",
      mode: "interactive",
      permissions: { "filesystem:read": true },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  afterEach(() => {
    engine.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("executes clean recovery on healthy database", async () => {
    const recoveryEngine = new CrashRecoveryEngine({
      engine,
      eventStore,
      projectionManager,
      leaseManager,
      checkpointRepo,
      artifactRepo,
    });

    const record = await recoveryEngine.executeRecovery();

    expect(record.status).toBe("SUCCESS");
    expect(record.databaseIntegrityPassed).toBe(true);
    expect(record.staleLeasesEvictedCount).toBe(0);
    expect(record.orphansDetectedCount).toBe(0);
    expect(record.anomalies).toHaveLength(0);
  });

  it("reclaims expired leases and rebuilds projections from event log during crash recovery", async () => {
    // 1. Append events to event log
    eventStore.append({
      id: "evt_rec_01",
      schemaVersion: 1,
      projectId: "proj_rec_01",
      sessionId: "sess_rec_01",
      taskId: "tsk_rec_01",
      type: "task.created",
      actor: "agent",
      payload: { objective: "Process dataset" },
      agentId: "agent_primary",
      timestamp: new Date().toISOString(),
    });

    eventStore.append({
      id: "evt_rec_02",
      schemaVersion: 1,
      projectId: "proj_rec_01",
      sessionId: "sess_rec_01",
      taskId: "tsk_rec_01",
      type: "task.started",
      actor: "agent",
      payload: { agentRole: "worker_agent" },
      agentId: "worker_agent",
      timestamp: new Date().toISOString(),
    });

    // 2. Save task and acquire lease with very short TTL
    taskRepo.save({
      id: "tsk_rec_01",
      projectId: "proj_rec_01",
      sessionId: "sess_rec_01",
      objective: "Process dataset",
      status: "running",
      priority: "high",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    leaseManager.acquireLease("tsk_rec_01", "worker_agent", 30); // 30ms

    // 3. Save valid checkpoint
    const chk = CheckpointManifestBuilder.createCheckpoint({
      projectId: "proj_rec_01",
      sessionId: "sess_rec_01",
      type: "automatic",
      eventOffset: 2,
    });
    checkpointRepo.save(chk);

    // Wait 50ms for lease to expire
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 4. Run recovery engine
    const recoveryEngine = new CrashRecoveryEngine({
      engine,
      eventStore,
      projectionManager,
      leaseManager,
      checkpointRepo,
      artifactRepo,
    });

    const record = await recoveryEngine.executeRecovery();

    expect(record.databaseIntegrityPassed).toBe(true);
    expect(record.staleLeasesEvictedCount).toBe(1);
    expect(record.projectionsRebuiltCount).toBe(2);
    expect(record.eventsValidatedCount).toBe(2);

    // Verify task state was recovered back to queued
    const recoveredTask = taskRepo.findById("tsk_rec_01");
    expect(recoveredTask?.status).toBe("queued");

    // Verify projections were populated from event store
    const summary = projectionManager.sessionSummary.getState("sess_rec_01");
    expect(summary?.totalEvents).toBe(2);

    const board = projectionManager.taskBoard.getState("sess_rec_01");
    expect(board?.running.some((t) => t.taskId === "tsk_rec_01")).toBe(true);
  });

  it("flags corrupted checkpoints during crash recovery", async () => {
    // Insert checkpoint with corrupted sha256 checksum
    engine.raw.prepare(`
      INSERT INTO checkpoints (id, type, project_id, session_id, manifest_json, sha256, created_at, validation_checksum)
      VALUES ('chk_tampered', 'automatic', 'proj_rec_01', 'sess_rec_01', '{"eventOffset": 5}', '${"0".repeat(64)}', '2026-08-30T00:00:00Z', 'invalid_checksum');
    `).run();

    const recoveryEngine = new CrashRecoveryEngine({
      engine,
      eventStore,
      projectionManager,
      leaseManager,
      checkpointRepo,
      artifactRepo,
    });

    const record = await recoveryEngine.executeRecovery();
    expect(record.status).toBe("CRITICAL_ERROR");
    expect(record.anomalies.some((a) => a.type === "CORRUPTED_CHECKPOINT")).toBe(true);
  });
});
