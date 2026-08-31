import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { MCPRegistry } from "../../src/mcp/mcp-registry.js";
import { EventTypes } from "../../src/domain/event.js";

describe("P5.1 MCP Durability & Event Sourcing Audit", () => {
  let engine: SqliteEngine;
  let eventStore: EventStore;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    new MigrationEngine(engine).migrate();

    const now = new Date().toISOString();
    new ProjectRepository(engine).save({
      id: "prj_mcp_dur",
      name: "Project MCP Durability",
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

  it("emits immutable audit events to SQLite EventStore on MCP server registration and discovery", async () => {
    const registry = new MCPRegistry({ eventStore });

    registry.registerServer({
      id: "srv_dur_01",
      name: "Durability Server",
      transport: "stdio",
      projectId: "prj_mcp_dur",
    });

    await registry.discoverServer("srv_dur_01");

    const events = eventStore.getEventsByProject("prj_mcp_dur");
    expect(events.length).toBeGreaterThanOrEqual(1);

    const regEvent = events.find((e) => e.type === EventTypes.MCP_REGISTERED);
    expect(regEvent).toBeDefined();
    expect(regEvent?.payload.serverId).toBe("srv_dur_01");
  });
});
