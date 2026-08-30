import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { ToolGateway } from "../../src/tools/tool-gateway.js";
import { ToolRegistry } from "../../src/tools/tool-registry.js";
import { EventTypes } from "../../src/domain/event.js";

describe("P4.2 Tool Gateway — Observation & Immutable Event Logging", () => {
  let engine: SqliteEngine;
  let eventStore: EventStore;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    new MigrationEngine(engine).migrate();

    const now = new Date().toISOString();
    new ProjectRepository(engine).save({
      id: "prj_obs_test",
      name: "Project Obs Test",
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

  it("emits TOOL_COMPLETED event upon successful execution", async () => {
    const registry = new ToolRegistry();
    registry.register({
      definition: {
        name: "calc_sum",
        parametersSchema: { properties: { a: { type: "number" }, b: { type: "number" } } },
        isIdempotent: true,
      },
      handler: async (args: any) => args.a + args.b,
    });

    const gateway = new ToolGateway({ registry, eventStore });
    const obs = await gateway.invoke({
      callId: "call_calc",
      toolName: "calc_sum",
      arguments: { a: 2, b: 3 },
      actor: { id: "agent_math", type: "agent" },
      project: { id: "prj_obs_test" },
    });

    expect(obs.status).toBe("success");
    expect(obs.result).toBe(5);

    const events = eventStore.getEventsByProject("prj_obs_test");
    expect(events.length).toBe(1);
    expect(events[0].type).toBe(EventTypes.TOOL_COMPLETED);
    expect(events[0].payload.toolName).toBe("calc_sum");
  });
});
