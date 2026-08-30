import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
import { CheckpointManifestBuilder } from "../../src/recovery/checkpoint-manifest.js";
import { SessionResumeEngine } from "../../src/resume/session-resume-engine.js";
import { EventTypes } from "../../src/domain/event.js";

describe("P1.5 Resume Subsystem — Recovery Edge Cases & Checkpoint Fallback", () => {
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
  let resumeEngine: SessionResumeEngine;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
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
    leaseManager = new LeaseManager({ taskRepo });

    resumeEngine = new SessionResumeEngine({
      engine,
      projectRepo,
      sessionRepo,
      taskRepo,
      checkpointRepo,
      artifactRepo,
      eventRepo,
      eventStore,
      projectionManager,
      leaseManager,
    });

    projectRepo.save({
      id: "proj_edge",
      name: "Edge Project",
      rootPath: "/edge",
      status: "active",
      tags: [],
      modelProfile: "claude-3-5-sonnet",
      memoryNamespace: "m",
      orchestrationProfile: "o",
      trustProfile: "developer",
      createdAt: "2026-08-30T21:00:00.000Z",
      lastOpenedAt: "2026-08-30T21:00:00.000Z",
      lastActivityAt: "2026-08-30T21:00:00.000Z",
    });

    sessionRepo.save({
      id: "sess_edge_1",
      projectId: "proj_edge",
      name: "Edge Session",
      branch: "main",
      status: "active",
      modelProfile: "claude-3-5-sonnet",
      keyPoolProfile: "k",
      mode: "interactive",
      permissions: {},
      createdAt: "2026-08-30T21:00:00.000Z",
      updatedAt: "2026-08-30T21:00:00.000Z",
    });
  });

  afterEach(() => {
    engine.close();
  });

  it("handles corrupted checkpoint by falling back to event replay during session resume", async () => {
    // Append valid events
    eventStore.append({
      id: "evt_edge_1",
      schemaVersion: 1,
      projectId: "proj_edge",
      sessionId: "sess_edge_1",
      type: EventTypes.SESSION_CREATED,
      actor: "user",
      payload: { name: "Edge Session" },
      timestamp: "2026-08-30T21:00:00.000Z",
    });

    // Create a tampered checkpoint
    const chk = CheckpointManifestBuilder.createCheckpoint({
      projectId: "proj_edge",
      sessionId: "sess_edge_1",
      type: "automatic",
      eventOffset: 1,
    });
    const tampered = { ...chk, validationChecksum: "tampered_invalid_checksum" };
    checkpointRepo.save(tampered);

    // Resume by session target: should warn about checkpoint corruption but succeed using authoritative events
    const result = await resumeEngine.resume({
      target: { type: "session", sessionId: "sess_edge_1" },
    });

    expect(result.success).toBe(true);
    expect(result.sessionState.status).toBe("active");
  });

  it("rejects resume when explicitly targeted checkpoint ID is corrupted", async () => {
    const chk = CheckpointManifestBuilder.createCheckpoint({
      projectId: "proj_edge",
      sessionId: "sess_edge_1",
      type: "automatic",
      eventOffset: 1,
    });
    const tampered = { ...chk, validationChecksum: "bad_checksum" };
    checkpointRepo.save(tampered);

    await expect(
      resumeEngine.resume({ target: { type: "checkpoint", checkpointId: chk.id } })
    ).rejects.toThrow(/Target checkpoint '.*' is corrupted/);
  });
});
