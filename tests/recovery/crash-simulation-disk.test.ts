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
import { LeaseManager } from "../../src/recovery/lease-manager.js";
import { CrashRecoveryEngine } from "../../src/recovery/crash-recovery-engine.js";
import { CheckpointManifestBuilder } from "../../src/recovery/checkpoint-manifest.js";

describe("P1.4 Checkpoints & Crash Recovery — Real Disk & Failure Matrix", () => {
  let tmpDir: string;
  let dbPath: string;
  let engine: SqliteEngine;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "anantham-disk-crash-"));
    dbPath = join(tmpDir, "disk-recovery.db");
    engine = new SqliteEngine({ path: dbPath });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();
  });

  afterEach(() => {
    if (engine.isOpen) {
      engine.close();
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("simulates abnormal disk termination and verifies deterministic recovery on reopen", async () => {
    const projectRepo = new ProjectRepository(engine);
    const sessionRepo = new SessionRepository(engine);
    const taskRepo = new TaskRepository(engine);
    const artifactRepo = new ArtifactRepository(engine);
    const checkpointRepo = new CheckpointRepository(engine);
    const eventStore = new EventStore(engine);

    // 1. Commit authoritative project and session
    projectRepo.save({
      id: "proj_disk_01",
      name: "Disk Crash Test Project",
      rootPath: "/disk/proj",
      status: "active",
      tags: ["durability"],
      modelProfile: "claude-3-5-sonnet",
      memoryNamespace: "project/proj_disk_01",
      orchestrationProfile: "default",
      trustProfile: "developer",
      createdAt: "2026-08-30T21:00:00.000Z",
      lastOpenedAt: "2026-08-30T21:00:00.000Z",
      lastActivityAt: "2026-08-30T21:00:00.000Z",
    });

    sessionRepo.save({
      id: "sess_disk_01",
      projectId: "proj_disk_01",
      name: "Disk Crash Session",
      branch: "main",
      status: "active",
      modelProfile: "claude-3-5-sonnet",
      keyPoolProfile: "default",
      mode: "interactive",
      permissions: { "filesystem.read": true },
      createdAt: "2026-08-30T21:00:00.000Z",
      updatedAt: "2026-08-30T21:00:00.000Z",
    });

    taskRepo.save({
      id: "task_disk_01",
      projectId: "proj_disk_01",
      sessionId: "sess_disk_01",
      objective: "Compile heavy dataset",
      status: "running",
      priority: "critical",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: "2026-08-30T21:00:00.000Z",
      updatedAt: "2026-08-30T21:00:00.000Z",
    });

    const artSha = "e".repeat(64);
    artifactRepo.save({
      id: "art_disk_01",
      type: "dataset",
      projectId: "proj_disk_01",
      sessionId: "sess_disk_01",
      contentUri: "file:///disk/dataset.csv",
      sha256: artSha,
      sourceEventIds: ["evt_disk_01"],
      createdAt: "2026-08-30T21:00:00.000Z",
    });

    eventStore.append({
      id: "evt_disk_01",
      schemaVersion: 1,
      projectId: "proj_disk_01",
      sessionId: "sess_disk_01",
      taskId: "task_disk_01",
      type: "task.created",
      actor: "agent",
      payload: { objective: "Compile heavy dataset" },
      timestamp: "2026-08-30T21:00:00.000Z",
    });

    eventStore.append({
      id: "evt_disk_02",
      schemaVersion: 1,
      projectId: "proj_disk_01",
      sessionId: "sess_disk_01",
      taskId: "task_disk_01",
      type: "task.started",
      actor: "agent",
      payload: { worker: "agent_gpu_1" },
      timestamp: "2026-08-30T21:00:01.000Z",
    });

    const leaseManager = new LeaseManager({ taskRepo, defaultTtlMs: 50 });
    leaseManager.acquireLease("task_disk_01", "agent_gpu_1", 30); // 30ms

    const checkpoint = CheckpointManifestBuilder.createCheckpoint({
      projectId: "proj_disk_01",
      sessionId: "sess_disk_01",
      type: "task-completion",
      eventOffset: 2,
      artifactHashes: {
        art_disk_01: artSha,
      },
    });
    checkpointRepo.save(checkpoint);

    // 2. Simulate abnormal termination / SIGKILL
    engine.close();

    // 3. Wait 50ms for lease expiration
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 4. Reopen the database from disk on fresh process restart
    const reopenedEngine = new SqliteEngine({ path: dbPath });
    reopenedEngine.open();

    const reopenedTaskRepo = new TaskRepository(reopenedEngine);
    const reopenedCheckpointRepo = new CheckpointRepository(reopenedEngine);
    const reopenedArtifactRepo = new ArtifactRepository(reopenedEngine);
    const reopenedEventStore = new EventStore(reopenedEngine);
    const reopenedProjectionManager = new ProjectionManager(reopenedEventStore);
    const reopenedLeaseManager = new LeaseManager({ taskRepo: reopenedTaskRepo });

    const recoveryEngine = new CrashRecoveryEngine({
      engine: reopenedEngine,
      eventStore: reopenedEventStore,
      projectionManager: reopenedProjectionManager,
      leaseManager: reopenedLeaseManager,
      checkpointRepo: reopenedCheckpointRepo,
      artifactRepo: reopenedArtifactRepo,
    });

    // 5. Execute recovery
    const recoveryRecord = await recoveryEngine.executeRecovery();

    expect(recoveryRecord.status).toBe("SUCCESS");
    expect(recoveryRecord.databaseIntegrityPassed).toBe(true);
    expect(recoveryRecord.eventsValidatedCount).toBe(2);
    expect(recoveryRecord.projectionsRebuiltCount).toBe(2);
    expect(recoveryRecord.orphansDetectedCount).toBe(0);

    // 6. Verify projections were rebuilt accurately from events
    const sessionSummary = reopenedProjectionManager.sessionSummary.getState("sess_disk_01");
    expect(sessionSummary?.totalEvents).toBe(2);

    const taskBoard = reopenedProjectionManager.taskBoard.getState("sess_disk_01");
    expect(taskBoard?.running.some((t) => t.taskId === "task_disk_01")).toBe(true);

    reopenedEngine.close();
  });

  it("handles multi-anomaly recovery by classifying and preserving evidence", async () => {
    const projectRepo = new ProjectRepository(engine);
    const sessionRepo = new SessionRepository(engine);

    projectRepo.save({
      id: "proj_anom_01",
      name: "Anomaly Test",
      rootPath: "/tmp/anom",
      status: "active",
      tags: [],
      modelProfile: "m",
      memoryNamespace: "mem",
      orchestrationProfile: "o",
      trustProfile: "developer",
      createdAt: "2026-08-30T21:00:00.000Z",
      lastOpenedAt: "2026-08-30T21:00:00.000Z",
      lastActivityAt: "2026-08-30T21:00:00.000Z",
    });

    sessionRepo.save({
      id: "sess_anom_01",
      projectId: "proj_anom_01",
      name: "Session Anomaly",
      branch: "main",
      status: "active",
      modelProfile: "m",
      keyPoolProfile: "k",
      mode: "interactive",
      permissions: {},
      createdAt: "2026-08-30T21:00:00.000Z",
      updatedAt: "2026-08-30T21:00:00.000Z",
    });

    // 1. Insert orphan artifact with disabled foreign keys
    engine.raw.exec("PRAGMA foreign_keys = OFF;");
    engine.raw.prepare(`
      INSERT INTO artifacts (id, type, project_id, session_id, content_uri, sha256, source_event_ids_json, created_at)
      VALUES ('art_ghost_disk', 'code-diff', 'proj_anom_01', 'non_existent_session', 'file:///ghost.patch', '${"a".repeat(64)}', '[]', '2026-08-30T21:00:00.000Z');
    `).run();

    // 2. Insert corrupted checkpoint
    engine.raw.prepare(`
      INSERT INTO checkpoints (id, type, project_id, session_id, manifest_json, sha256, created_at, validation_checksum)
      VALUES ('chk_bad_sha', 'automatic', 'proj_anom_01', 'sess_anom_01', '{"eventOffset": 10}', '${"0".repeat(64)}', '2026-08-30T21:00:00.000Z', 'bogus');
    `).run();
    engine.raw.exec("PRAGMA foreign_keys = ON;");

    const checkpointRepo = new CheckpointRepository(engine);
    const artifactRepo = new ArtifactRepository(engine);

    const recoveryEngine = new CrashRecoveryEngine({
      engine,
      checkpointRepo,
      artifactRepo,
    });

    const recoveryRecord = await recoveryEngine.executeRecovery();

    expect(recoveryRecord.status).toBe("CRITICAL_ERROR");
    expect(recoveryRecord.orphansDetectedCount).toBeGreaterThan(0);
    expect(recoveryRecord.anomalies.some((a) => a.type === "ORPHAN_ARTIFACT" && a.actionTaken === "PRESERVED")).toBe(true);
    expect(recoveryRecord.anomalies.some((a) => a.type === "CORRUPTED_CHECKPOINT" && a.actionTaken === "FLAGGED")).toBe(true);
  });
});
