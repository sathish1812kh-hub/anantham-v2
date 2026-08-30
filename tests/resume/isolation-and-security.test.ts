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
import { SessionResumeEngine } from "../../src/resume/session-resume-engine.js";

describe("P1.5 Resume Subsystem — Project Isolation & Security Boundaries", () => {
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

    // Seed Project A and Project B
    projectRepo.save({
      id: "proj_alpha",
      name: "Alpha Project",
      rootPath: "/projects/alpha",
      status: "active",
      tags: ["alpha"],
      modelProfile: "claude-3-5-sonnet",
      memoryNamespace: "project/alpha",
      orchestrationProfile: "default",
      trustProfile: "developer",
      createdAt: "2026-08-30T21:00:00.000Z",
      lastOpenedAt: "2026-08-30T21:00:00.000Z",
      lastActivityAt: "2026-08-30T21:00:00.000Z",
    });

    projectRepo.save({
      id: "proj_beta",
      name: "Beta Project",
      rootPath: "/projects/beta",
      status: "active",
      tags: ["beta"],
      modelProfile: "claude-3-5-sonnet",
      memoryNamespace: "project/beta",
      orchestrationProfile: "default",
      trustProfile: "developer",
      createdAt: "2026-08-30T21:00:00.000Z",
      lastOpenedAt: "2026-08-30T21:00:00.000Z",
      lastActivityAt: "2026-08-30T21:00:00.000Z",
    });

    sessionRepo.save({
      id: "sess_alpha_1",
      projectId: "proj_alpha",
      name: "Alpha Session 1",
      branch: "main",
      status: "active",
      modelProfile: "claude-3-5-sonnet",
      keyPoolProfile: "default",
      mode: "interactive",
      permissions: { "filesystem.read": true },
      createdAt: "2026-08-30T21:00:00.000Z",
      updatedAt: "2026-08-30T21:00:00.000Z",
    });

    sessionRepo.save({
      id: "sess_beta_1",
      projectId: "proj_beta",
      name: "Beta Session 1",
      branch: "main",
      status: "active",
      modelProfile: "claude-3-5-sonnet",
      keyPoolProfile: "default",
      mode: "interactive",
      permissions: { "network.outbound": false },
      createdAt: "2026-08-30T21:00:00.000Z",
      updatedAt: "2026-08-30T21:00:00.000Z",
    });
  });

  afterEach(() => {
    engine.close();
  });

  it("strictly preserves project boundaries when resuming by project target", async () => {
    const alphaResult = await resumeEngine.resume({
      target: { type: "project", projectName: "Alpha Project" },
    });
    expect(alphaResult.projectId).toBe("proj_alpha");
    expect(alphaResult.sessionId).toBe("sess_alpha_1");

    const betaResult = await resumeEngine.resume({
      target: { type: "project", projectName: "Beta Project" },
    });
    expect(betaResult.projectId).toBe("proj_beta");
    expect(betaResult.sessionId).toBe("sess_beta_1");
  });

  it("preserves explicit security permissions across resume without escalation", async () => {
    const result = await resumeEngine.resume({
      target: { type: "session", sessionId: "sess_beta_1" },
    });
    expect(result.session.permissions).toEqual({ "network.outbound": false });
  });
});
