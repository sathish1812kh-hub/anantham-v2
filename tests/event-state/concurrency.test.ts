import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { ProjectionManager } from "../../src/event-state/projections/projection-manager.js";
import { ProjectRepository, SessionRepository } from "../../src/persistence/index.js";
import { EventTypes } from "../../src/domain/event.js";

describe("Event-State Concurrency & Multi-Session Stream Isolation", () => {
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
      name: "Concurrency Test Project",
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
      id: "sess_A",
      projectId: "proj_01",
      name: "Session A",
      branch: "branch-a",
      status: "active",
      modelProfile: "m",
      keyPoolProfile: "k",
      mode: "interactive",
      permissions: {},
      createdAt: "2026-08-30T20:00:00.000Z",
      updatedAt: "2026-08-30T20:00:00.000Z",
    });

    sessionRepo.save({
      id: "sess_B",
      projectId: "proj_01",
      name: "Session B",
      branch: "branch-b",
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

  it("handles interleaved event appends across isolated sessions without crosstalk", () => {
    // Interleave events between session A and session B
    eventStore.append({
      id: "ea_1",
      schemaVersion: 1,
      projectId: "proj_01",
      sessionId: "sess_A",
      type: EventTypes.SESSION_CREATED,
      actor: "user",
      timestamp: "2026-08-30T20:00:01.000Z",
      payload: {},
    });

    eventStore.append({
      id: "eb_1",
      schemaVersion: 1,
      projectId: "proj_01",
      sessionId: "sess_B",
      type: EventTypes.SESSION_CREATED,
      actor: "user",
      timestamp: "2026-08-30T20:00:02.000Z",
      payload: {},
    });

    eventStore.append({
      id: "ea_2",
      schemaVersion: 1,
      projectId: "proj_01",
      sessionId: "sess_A",
      taskId: "task_a1",
      type: EventTypes.TASK_CREATED,
      actor: "agent",
      timestamp: "2026-08-30T20:00:03.000Z",
      payload: { objective: "Task A1" },
    });

    eventStore.append({
      id: "eb_2",
      schemaVersion: 1,
      projectId: "proj_01",
      sessionId: "sess_B",
      taskId: "task_b1",
      type: EventTypes.TASK_CREATED,
      actor: "agent",
      timestamp: "2026-08-30T20:00:04.000Z",
      payload: { objective: "Task B1" },
    });

    // Check isolation in EventStore streams
    const streamA = eventStore.getEventsBySession("sess_A");
    const streamB = eventStore.getEventsBySession("sess_B");

    expect(streamA).toHaveLength(2);
    expect(streamA.map((e) => e.id)).toEqual(["ea_1", "ea_2"]);

    expect(streamB).toHaveLength(2);
    expect(streamB.map((e) => e.id)).toEqual(["eb_1", "eb_2"]);

    // Check isolation in Projections
    const summaryA = projManager.sessionSummary.getState("sess_A");
    const summaryB = projManager.sessionSummary.getState("sess_B");

    expect(summaryA?.totalTasks).toBe(1);
    expect(summaryB?.totalTasks).toBe(1);

    const boardA = projManager.taskBoard.getState("sess_A");
    const boardB = projManager.taskBoard.getState("sess_B");

    expect(boardA?.queued[0]?.taskId).toBe("task_a1");
    expect(boardB?.queued[0]?.taskId).toBe("task_b1");
  });
});
