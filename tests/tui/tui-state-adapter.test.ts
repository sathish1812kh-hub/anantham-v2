import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { TaskBoardProjection } from "../../src/event-state/projections/task-board-projection.js";
import { SessionSummaryProjection } from "../../src/event-state/projections/session-summary-projection.js";
import { TuiStateAdapter } from "../../src/tui/tui-state-adapter.js";
import { EventTypes, type HarnessEvent } from "../../src/domain/event.js";

describe("P8.2 TUI — State Adapter & Real-Time Event Ingestion", () => {
  let engine: SqliteEngine;
  let eventStore: EventStore;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let taskRepo: TaskRepository;
  let taskBoardProjection: TaskBoardProjection;
  let sessionSummaryProjection: SessionSummaryProjection;
  let adapter: TuiStateAdapter;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    eventStore = new EventStore(engine);
    projectRepo = new ProjectRepository(engine);
    sessionRepo = new SessionRepository(engine);
    taskRepo = new TaskRepository(engine);
    taskBoardProjection = new TaskBoardProjection();
    sessionSummaryProjection = new SessionSummaryProjection();

    projectRepo.save({
      id: "proj_01",
      name: "Project 01",
      rootPath: "/proj1",
      status: "active",
      tags: [],
      modelProfile: "default",
      memoryNamespace: "default",
      orchestrationProfile: "default",
      trustProfile: "safe",
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      metadata: {},
    });

    sessionRepo.save({
      id: "sess_01",
      projectId: "proj_01",
      name: "Session 01",
      branch: "main",
      status: "active",
      modelProfile: "default",
      keyPoolProfile: "default",
      mode: "interactive",
      permissions: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {},
    });

    adapter = new TuiStateAdapter({
      eventStore,
      projectRepo,
      sessionRepo,
      taskRepo,
      taskBoardProjection,
      sessionSummaryProjection,
      initialProjectId: "proj_01",
      initialSessionId: "sess_01",
    });
  });

  afterEach(() => {
    adapter.destroy();
    engine.close();
  });

  it("updates recent events and projections upon receiving events from EventStore", () => {
    let notified = false;
    adapter.subscribe(() => {
      notified = true;
    });

    const event: HarnessEvent = {
      id: "evt_01",
      schemaVersion: 1,
      type: EventTypes.TASK_CREATED,
      timestamp: new Date().toISOString(),
      actor: "agent",
      projectId: "proj_01",
      sessionId: "sess_01",
      taskId: "task_01",
      payload: { objective: "Build real-time TUI" },
    };

    eventStore.append(event);

    expect(notified).toBe(true);
    expect(adapter.getRecentEvents().length).toBe(1);
    expect(adapter.getRecentEvents()[0]!.type).toBe(EventTypes.TASK_CREATED);
  });

  it("isolates subscriber errors without breaking EventStore append transactions", () => {
    // Attach throwing subscriber
    adapter.subscribe(() => {
      throw new Error("Simulated rendering failure inside subscriber!");
    });

    const validEvent: HarnessEvent = {
      id: "evt_safe_02",
      schemaVersion: 1,
      type: EventTypes.TASK_STARTED,
      timestamp: new Date().toISOString(),
      actor: "system",
      projectId: "proj_01",
      sessionId: "sess_01",
      taskId: "task_01",
      payload: {},
    };

    expect(() => {
      eventStore.append(validEvent);
    }).not.toThrow();

    expect(eventStore.getEventById("evt_safe_02")).toBeDefined();
  });
});
