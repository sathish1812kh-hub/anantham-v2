import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { ProjectRepository, SessionRepository } from "../../src/persistence/index.js";
import { EventTypes, type HarnessEvent } from "../../src/domain/event.js";

describe("EventStore", () => {
  let engine: SqliteEngine;
  let eventStore: EventStore;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    eventStore = new EventStore(engine);
    projectRepo = new ProjectRepository(engine);
    sessionRepo = new SessionRepository(engine);

    // Setup base project and session for foreign key links
    projectRepo.save({
      id: "proj_01",
      name: "Test Project",
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
  });

  afterEach(() => {
    engine.close();
  });

  it("appends and reads immutable events in deterministic order", () => {
    const e1: HarnessEvent = {
      id: "evt_01",
      schemaVersion: 1,
      projectId: "proj_01",
      sessionId: "sess_01",
      type: EventTypes.SESSION_CREATED,
      actor: "user",
      timestamp: "2026-08-30T20:00:01.000Z",
      payload: { name: "Session 1" },
    };

    const e2: HarnessEvent = {
      id: "evt_02",
      schemaVersion: 1,
      projectId: "proj_01",
      sessionId: "sess_01",
      taskId: "task_01",
      type: EventTypes.TASK_CREATED,
      actor: "agent",
      timestamp: "2026-08-30T20:00:02.000Z",
      payload: { objective: "Implement EventStore" },
    };

    const committed1 = eventStore.append(e1);
    const committed2 = eventStore.append(e2);

    expect(Object.isFrozen(committed1)).toBe(true);
    expect(Object.isFrozen(committed2)).toBe(true);

    const stream = eventStore.getEventsBySession("sess_01");
    expect(stream).toHaveLength(2);
    expect(stream[0]?.id).toBe("evt_01");
    expect(stream[1]?.id).toBe("evt_02");

    const byProject = eventStore.getEventsByProject("proj_01");
    expect(byProject).toHaveLength(2);
  });

  it("dispatches events to subscribers without letting subscriber errors fail append", () => {
    const received: string[] = [];

    // Valid subscriber
    const unsub = eventStore.subscribe({ sessionId: "sess_01" }, (evt) => {
      received.push(evt.id);
    });

    // Failing subscriber (simulates subscriber crash)
    eventStore.subscribe({ sessionId: "sess_01" }, () => {
      throw new Error("Subscriber crash!");
    });

    const event: HarnessEvent = {
      id: "evt_safe_01",
      schemaVersion: 1,
      projectId: "proj_01",
      sessionId: "sess_01",
      type: EventTypes.SESSION_CREATED,
      actor: "user",
      timestamp: "2026-08-30T20:00:00.000Z",
      payload: {},
    };

    // Append must succeed despite subscriber throwing
    const committed = eventStore.append(event);
    expect(committed.id).toBe("evt_safe_01");
    expect(received).toEqual(["evt_safe_01"]);

    unsub();
  });
});
