import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { ProjectionManager } from "../../src/event-state/projections/projection-manager.js";
import { ProjectRepository, SessionRepository } from "../../src/persistence/index.js";
import { EventTypes } from "../../src/domain/event.js";

describe("Rebuildable Projections & ProjectionManager", () => {
  let engine: SqliteEngine;
  let eventStore: EventStore;
  let projManager: ProjectionManager;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    const projectRepo = new ProjectRepository(engine);
    projectRepo.save({
      id: "proj_01",
      name: "Projection Test Project",
      rootPath: "C:/test",
      status: "active",
      tags: [],
      modelProfile: "m",
      memoryNamespace: "mem",
      orchestrationProfile: "o",
      trustProfile: "developer",
      createdAt: "2026-08-30T20:00:00.000Z",
      lastOpenedAt: "2026-08-30T20:00:00.000Z",
      lastActivityAt: "2026-08-30T20:00:00.000Z",
    });

    const sessionRepo = new SessionRepository(engine);
    sessionRepo.save({
      id: "sess_01",
      projectId: "proj_01",
      name: "Session 1",
      branch: "main",
      status: "active",
      modelProfile: "m",
      keyPoolProfile: "k",
      mode: "interactive",
      permissions: {},
      createdAt: "2026-08-30T20:00:00.000Z",
      updatedAt: "2026-08-30T20:00:00.000Z",
    });

    eventStore = new EventStore(engine);
    projManager = new ProjectionManager(eventStore);
  });

  afterEach(() => {
    projManager.dispose();
    engine.close();
  });

  it("updates projections incrementally as events are appended", () => {
    eventStore.append({
      id: "e1",
      schemaVersion: 1,
      projectId: "proj_01",
      sessionId: "sess_01",
      type: EventTypes.SESSION_CREATED,
      actor: "user",
      timestamp: "2026-08-30T20:00:00.000Z",
      payload: { name: "Interactive Session" },
    });

    eventStore.append({
      id: "e2",
      schemaVersion: 1,
      projectId: "proj_01",
      sessionId: "sess_01",
      taskId: "t1",
      type: EventTypes.TASK_CREATED,
      actor: "agent",
      timestamp: "2026-08-30T20:00:01.000Z",
      payload: { objective: "Build Projection" },
    });

    eventStore.append({
      id: "e3",
      schemaVersion: 1,
      projectId: "proj_01",
      sessionId: "sess_01",
      taskId: "t1",
      type: EventTypes.TASK_STARTED,
      actor: "agent",
      timestamp: "2026-08-30T20:00:02.000Z",
      payload: {},
    });

    const summary = projManager.sessionSummary.getState("sess_01");
    expect(summary?.totalEvents).toBe(3);
    expect(summary?.totalTasks).toBe(1);
    expect(summary?.status).toBe("active");

    const board = projManager.taskBoard.getState("sess_01");
    expect(board?.running).toHaveLength(1);
    expect(board?.running[0]?.taskId).toBe("t1");
    expect(board?.queued).toHaveLength(0);
  });

  it("wipes projections and rebuilds them losslessly from event log", () => {
    // 1. Append a sequence of lifecycle events
    eventStore.append({
      id: "e1",
      schemaVersion: 1,
      projectId: "proj_01",
      sessionId: "sess_01",
      type: EventTypes.SESSION_CREATED,
      actor: "user",
      timestamp: "2026-08-30T20:00:00.000Z",
      payload: { name: "Session 1" },
    });
    eventStore.append({
      id: "e2",
      schemaVersion: 1,
      projectId: "proj_01",
      sessionId: "sess_01",
      taskId: "t1",
      type: EventTypes.TASK_CREATED,
      actor: "agent",
      timestamp: "2026-08-30T20:00:01.000Z",
      payload: { objective: "Task Alpha" },
    });
    eventStore.append({
      id: "e3",
      schemaVersion: 1,
      projectId: "proj_01",
      sessionId: "sess_01",
      taskId: "t1",
      type: EventTypes.TASK_COMPLETED,
      actor: "agent",
      timestamp: "2026-08-30T20:00:02.000Z",
      payload: {},
    });

    const preWipeSummary = projManager.sessionSummary.getState("sess_01");
    const preWipeBoard = projManager.taskBoard.getState("sess_01");

    // 2. Wipe / Reset all projections (simulating projection corruption/loss)
    projManager.sessionSummary.reset();
    projManager.taskBoard.reset();

    expect(projManager.sessionSummary.getState("sess_01")).toBeUndefined();
    expect(projManager.taskBoard.getState("sess_01")).toBeUndefined();

    // 3. Rebuild from authoritative event log
    projManager.rebuildSession("sess_01");

    const postRebuildSummary = projManager.sessionSummary.getState("sess_01");
    const postRebuildBoard = projManager.taskBoard.getState("sess_01");

    // 4. Assert 100% equivalence
    expect(postRebuildSummary).toEqual(preWipeSummary);
    expect(postRebuildBoard).toEqual(preWipeBoard);
    expect(postRebuildBoard?.completed).toHaveLength(1);
    expect(postRebuildBoard?.completed[0]?.taskId).toBe("t1");
  });
});
