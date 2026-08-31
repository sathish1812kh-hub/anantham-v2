import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { HookManager } from "../../src/hooks/hook-manager.js";
import { EventTypes } from "../../src/domain/event.js";

describe("P5.4 Hooks — Durability & Event Sourcing Audit", () => {
  let engine: SqliteEngine;
  let eventStore: EventStore;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    new MigrationEngine(engine).migrate();

    const now = new Date().toISOString();
    new ProjectRepository(engine).save({
      id: "prj_hook_dur",
      name: "Project Hook Durability",
      rootPath: "C:/work",
      status: "active",
      tags: [],
      modelProfile: "default",
      memoryNamespace: "default",
      orchestrationProfile: "default",
      trustProfile: "trusted",
      createdAt: now,
      lastOpenedAt: now,
      lastActivityAt: now,
    });

    eventStore = new EventStore(engine);
  });

  afterEach(() => {
    engine.close();
  });

  it("emits immutable audit events to SQLite EventStore across hook lifecycle", async () => {
    const manager = new HookManager({ eventStore, projectId: "prj_hook_dur" });

    manager.register({
      id: "audit-session-start",
      name: "Audit Session Start",
      version: "1.0.0",
      event: "SessionStart",
      action: { type: "notify", message: "Audit Start" },
      priority: 100,
      enabled: true,
      scope: "project",
      projectId: "prj_hook_dur",
    });

    manager.disable("audit-session-start");
    manager.enable("audit-session-start");

    await manager.handleEvent({
      event: "SessionStart",
      projectId: "prj_hook_dur",
    });

    const events = eventStore.getEventsByProject("prj_hook_dur");
    expect(events.length).toBeGreaterThanOrEqual(4);

    const registered = events.find((e) => e.type === EventTypes.HOOK_REGISTERED);
    const disabled = events.find((e) => e.type === EventTypes.HOOK_DISABLED);
    const enabled = events.find((e) => e.type === EventTypes.HOOK_ENABLED);
    const triggered = events.find((e) => e.type === EventTypes.HOOK_TRIGGERED);
    const completed = events.find((e) => e.type === EventTypes.HOOK_COMPLETED);

    expect(registered).toBeDefined();
    expect(disabled).toBeDefined();
    expect(enabled).toBeDefined();
    expect(triggered).toBeDefined();
    expect(completed).toBeDefined();
  });
});
