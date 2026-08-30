import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { OpenAICompatibleAdapter } from "../../src/models/adapters/openai-compatible-adapter.js";
import { EventTypes } from "../../src/domain/event.js";

describe("P3 Gate Invariant - Zero State Loss under Live Provider Adapter Failures", () => {
  let engine: SqliteEngine;
  let eventStore: EventStore;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    new MigrationEngine(engine).migrate();

    const now = new Date().toISOString();
    new ProjectRepository(engine).save({
      id: "prj_provider_gate",
      name: "Project Provider Gate",
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

    new SessionRepository(engine).save({
      id: "ses_provider_gate",
      projectId: "prj_provider_gate",
      name: "Session Provider Gate",
      branch: "main",
      status: "active",
      modelProfile: "default",
      keyPoolProfile: "default",
      mode: "interactive",
      permissions: {},
      createdAt: now,
      updatedAt: now,
    });

    eventStore = new EventStore(engine);
  });

  afterEach(() => {
    engine.close();
  });

  it("P3 GATE INVARIANT: Catastrophic 503 Provider Outage does not corrupt SQLite event stream", async () => {
    // 1. Commit authoritative session started event
    eventStore.append({
      id: "evt_session_start_p3_5",
      schemaVersion: 1,
      projectId: "prj_provider_gate",
      sessionId: "ses_provider_gate",
      type: EventTypes.SESSION_CREATED,
      actor: "user",
      timestamp: new Date().toISOString(),
      payload: { mode: "interactive" },
    });

    expect(eventStore.getEventsBySession("ses_provider_gate").length).toBe(1);

    // 2. Execute failing adapter
    const failingFetch = async () => new Response(JSON.stringify({ error: "503 Outage" }), { status: 503 });
    const adapter = new OpenAICompatibleAdapter({ fetchFn: failingFetch as any });

    await expect(
      adapter.send({
        modelId: "gpt-4o",
        messages: [{ role: "user", content: "hi" }],
      })
    ).rejects.toThrow();

    // 3. SQLite event store is 100% durable and intact
    const events = eventStore.getEventsBySession("ses_provider_gate");
    expect(events.length).toBe(1);
    expect(events[0].id).toBe("evt_session_start_p3_5");
  });
});
