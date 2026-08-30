import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SqliteEngine } from "../../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../../src/persistence/repositories/project-repository.js";
import { EventStore } from "../../../src/event-state/event-store.js";
import { ToolGateway } from "../../../src/tools/tool-gateway.js";
import { ToolRegistry } from "../../../src/tools/tool-registry.js";
import { registerNativeTools } from "../../../src/tools/native/register-native-tools.js";
import { EventTypes } from "../../../src/domain/event.js";

describe("P4 Gate Invariant — Zero State Loss for Native Tool Invocations", () => {
  let engine: SqliteEngine;
  let eventStore: EventStore;
  let tempDir: string;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    new MigrationEngine(engine).migrate();

    const now = new Date().toISOString();
    new ProjectRepository(engine).save({
      id: "prj_native_dur",
      name: "Project Native Dur",
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
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "anantham_dur_native_"));
  });

  afterEach(() => {
    engine.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("P4 GATE INVARIANT: Native tool operations log durable immutable facts into SQLite EventStore", async () => {
    const registry = new ToolRegistry();
    registerNativeTools(registry, { projectRoot: tempDir });
    const gateway = new ToolGateway({ registry, eventStore });

    const obs = await gateway.invoke({
      callId: "call_write_dur",
      toolName: "write_file",
      arguments: { path: "durable.txt", content: "Preserved" },
      actor: { id: "agent_recorder", type: "agent" },
      project: { id: "prj_native_dur" },
    });

    expect(obs.status).toBe("success");

    const events = eventStore.getEventsByProject("prj_native_dur");
    expect(events.length).toBe(1);
    expect(events[0].type).toBe(EventTypes.TOOL_COMPLETED);
    expect(events[0].payload.toolName).toBe("write_file");
  });
});
