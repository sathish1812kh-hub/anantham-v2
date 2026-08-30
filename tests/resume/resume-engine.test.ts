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

describe("P1.5 Resume Subsystem — Session Resume Engine", () => {
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
      id: "proj_res_01",
      name: "Video Editor",
      rootPath: "/tmp/video",
      status: "active",
      tags: ["video", "pipeline"],
      modelProfile: "claude-3-5-sonnet",
      memoryNamespace: "project/proj_res_01",
      orchestrationProfile: "default",
      trustProfile: "developer",
      createdAt: "2026-08-30T21:00:00.000Z",
      lastOpenedAt: "2026-08-30T21:00:00.000Z",
      lastActivityAt: "2026-08-30T21:00:00.000Z",
    });

    sessionRepo.save({
      id: "sess_res_01",
      projectId: "proj_res_01",
      name: "Subtitle Pipeline",
      branch: "main",
      status: "active",
      modelProfile: "claude-3-5-sonnet",
      keyPoolProfile: "default",
      mode: "interactive",
      permissions: { "filesystem.read": true, "filesystem.write": true },
      createdAt: "2026-08-30T21:00:00.000Z",
      updatedAt: "2026-08-30T21:00:00.000Z",
    });
  });

  afterEach(() => {
    engine.close();
  });

  it("resumes session using target 'last'", async () => {
    // Append initial events
    eventStore.append({
      id: "evt_01",
      schemaVersion: 1,
      projectId: "proj_res_01",
      sessionId: "sess_res_01",
      type: EventTypes.SESSION_CREATED,
      actor: "user",
      payload: { name: "Subtitle Pipeline", branch: "main" },
      timestamp: "2026-08-30T21:00:00.000Z",
    });

    taskRepo.save({
      id: "task_sub_01",
      projectId: "proj_res_01",
      sessionId: "sess_res_01",
      objective: "Verify subtitle timing",
      status: "queued",
      priority: "high",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: "2026-08-30T21:00:01.000Z",
      updatedAt: "2026-08-30T21:00:01.000Z",
    });

    const result = await resumeEngine.resume({ target: { type: "last" } });

    expect(result.success).toBe(true);
    expect(result.sessionId).toBe("sess_res_01");
    expect(result.project.name).toBe("Video Editor");
    expect(result.taskDAG.totalTasksCount).toBe(1);
    expect(result.taskDAG.queuedTasks[0].id).toBe("task_sub_01");
    expect(result.sessionState.status).toBe("active");
  });

  it("resumes session by specific project name and validates checkpoint", async () => {
    const artSha = "f".repeat(64);
    artifactRepo.save({
      id: "art_sub_01",
      type: "subtitles",
      projectId: "proj_res_01",
      sessionId: "sess_res_01",
      contentUri: "file:///subtitles.srt",
      sha256: artSha,
      sourceEventIds: ["evt_01"],
      createdAt: "2026-08-30T21:00:00.000Z",
    });

    const checkpoint = CheckpointManifestBuilder.createCheckpoint({
      projectId: "proj_res_01",
      sessionId: "sess_res_01",
      type: "task-completion",
      eventOffset: 1,
      artifactHashes: { art_sub_01: artSha },
    });
    checkpointRepo.save(checkpoint);

    const result = await resumeEngine.resume({
      target: { type: "project", projectName: "Video Editor" },
    });

    expect(result.success).toBe(true);
    expect(result.checkpoint?.id).toBe(checkpoint.id);
    expect(result.artifactsSummary.validArtifactsCount).toBe(1);
  });

  it("guarantees idempotent repeated resume calls without duplicating state", async () => {
    const res1 = await resumeEngine.resume({ target: { type: "session", sessionId: "sess_res_01" } });
    const res2 = await resumeEngine.resume({ target: { type: "session", sessionId: "sess_res_01" } });

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);
    expect(res1.sessionId).toBe(res2.sessionId);
    expect(res1.taskDAG.totalTasksCount).toBe(res2.taskDAG.totalTasksCount);
  });

  it("throws clear error when session or project does not exist", async () => {
    await expect(
      resumeEngine.resume({ target: { type: "session", sessionId: "non_existent_sess" } })
    ).rejects.toThrow(/Session 'non_existent_sess' not found/);
  });
});
