import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { ProcessSupervisor } from "../../src/execution/process-supervisor.js";
import { LocalExecutor } from "../../src/execution/local-executor.js";
import { EventTypes } from "../../src/domain/event.js";

describe("P4 Gate Invariant — Zero State Loss for Execution Events", () => {
  let engine: SqliteEngine;
  let eventStore: EventStore;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    new MigrationEngine(engine).migrate();

    const now = new Date().toISOString();
    new ProjectRepository(engine).save({
      id: "prj_exec_dur",
      name: "Project Exec Dur",
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

  it("P4 GATE INVARIANT: Execution lifecycle completion emits immutable audit events into SQLite EventStore", async () => {
    const supervisor = new ProcessSupervisor({ eventStore });
    const executor = new LocalExecutor({ supervisor });

    const result = await executor.execute({
      executionId: "exec_dur_test",
      command: "node -v",
      metadata: { projectId: "prj_exec_dur" },
    });

    expect(result.status).toBe("completed");

    const events = eventStore.getEventsByProject("prj_exec_dur");
    expect(events.length).toBe(1);
    expect(events[0].type).toBe(EventTypes.TOOL_COMPLETED);
    expect(events[0].payload.executionId).toBe("exec_dur_test");
  });
});
