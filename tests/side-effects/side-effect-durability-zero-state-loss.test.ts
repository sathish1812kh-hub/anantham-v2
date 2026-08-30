import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { SideEffectJournal } from "../../src/side-effects/side-effect-journal.js";
import { EventTypes } from "../../src/domain/event.js";

describe("P4 Gate Invariant — Zero State Loss for Side Effects", () => {
  let engine: SqliteEngine;
  let eventStore: EventStore;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    new MigrationEngine(engine).migrate();

    const now = new Date().toISOString();
    new ProjectRepository(engine).save({
      id: "prj_se_dur",
      name: "Project Side Effect Dur",
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

  it("P4 GATE INVARIANT: Side effect completion emits immutable audit events into SQLite EventStore", () => {
    const journal = new SideEffectJournal({ eventStore });

    const entry = journal.record({
      projectId: "prj_se_dur",
      callId: "call_dur_01",
      toolName: "save_artifact",
      category: "idempotent_write",
      outcomeCertainty: "known_succeeded",
      args: { artifactId: "art_dur_01", content: "data" },
      responseStatus: "success",
    });

    expect(entry.journalId).toBeDefined();

    const events = eventStore.getEventsByProject("prj_se_dur");
    expect(events.length).toBe(1);
    expect(events[0].type).toBe(EventTypes.SIDE_EFFECT_COMPLETED);
    expect(events[0].payload.toolName).toBe("save_artifact");
    expect(events[0].payload.outcomeCertainty).toBe("known_succeeded");
  });

  it("P4 GATE INVARIANT: Unknown side effect outcome emits side_effect.unknown event into SQLite EventStore", () => {
    const journal = new SideEffectJournal({ eventStore });

    journal.record({
      projectId: "prj_se_dur",
      callId: "call_dur_02",
      toolName: "run_command",
      category: "non_idempotent_write",
      outcomeCertainty: "unknown",
      args: { command: "curl -X POST api.internal" },
      responseStatus: "timeout",
    });

    const events = eventStore.getEventsByProject("prj_se_dur");
    expect(events.length).toBe(1);
    expect(events[0].type).toBe(EventTypes.SIDE_EFFECT_UNKNOWN);
    expect(events[0].payload.outcomeCertainty).toBe("unknown");
  });
});
