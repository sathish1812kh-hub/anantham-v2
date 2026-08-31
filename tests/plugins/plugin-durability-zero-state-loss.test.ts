import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { PluginManager } from "../../src/plugins/plugin-manager.js";
import { EventTypes } from "../../src/domain/event.js";

describe("P5.2 Plugins — Durability & Event Sourcing Audit", () => {
  let engine: SqliteEngine;
  let eventStore: EventStore;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    new MigrationEngine(engine).migrate();

    const now = new Date().toISOString();
    new ProjectRepository(engine).save({
      id: "prj_plugin_dur",
      name: "Project Plugin Durability",
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

  it("emits immutable audit events to SQLite EventStore across plugin lifecycle", () => {
    const manager = new PluginManager({ eventStore, projectId: "prj_plugin_dur" });

    const manifest = {
      id: "audit.plugin",
      name: "Audit Plugin",
      version: "1.0.0",
      checksum: "hash_audit",
    };

    manager.install(manifest);
    manager.activate("audit.plugin");
    manager.disable("audit.plugin");

    const events = eventStore.getEventsByProject("prj_plugin_dur");
    expect(events.length).toBeGreaterThanOrEqual(3);

    const installed = events.find((e) => e.type === EventTypes.PLUGIN_INSTALLED);
    const activated = events.find((e) => e.type === EventTypes.PLUGIN_ACTIVATED);
    const disabled = events.find((e) => e.type === EventTypes.PLUGIN_DISABLED);

    expect(installed).toBeDefined();
    expect(activated).toBeDefined();
    expect(disabled).toBeDefined();
  });
});
