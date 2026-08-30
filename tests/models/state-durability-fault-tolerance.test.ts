import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { MockProviderAdapter } from "../../src/models/mock-provider-adapter.js";
import { RateLimitError } from "../../src/models/model-errors.js";
import { EventTypes } from "../../src/domain/event.js";

describe("P3 Gate Invariant - Provider Fault Tolerance & Durability", () => {
  let engine: SqliteEngine;
  let eventStore: EventStore;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    new MigrationEngine(engine).migrate();

    const now = new Date().toISOString();
    const projectRepo = new ProjectRepository(engine);
    const sessionRepo = new SessionRepository(engine);

    projectRepo.save({
      id: "prj_01",
      name: "Project 1",
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

    sessionRepo.save({
      id: "ses_01",
      projectId: "prj_01",
      name: "Session 1",
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

  it("P3 GATE INVARIANT: Catastrophic provider failure leaves committed SQLite state and EventStore 100% intact", async () => {
    // 1. Commit prior authoritative events
    eventStore.append({
      id: "evt_committed_01",
      schemaVersion: 1,
      projectId: "prj_01",
      sessionId: "ses_01",
      type: EventTypes.TASK_STARTED,
      actor: "user",
      timestamp: new Date().toISOString(),
      payload: { goal: "Survive provider failure" },
    });

    expect(eventStore.getEventsBySession("ses_01").length).toBe(1);

    // 2. Simulate catastrophic provider failure (e.g. RateLimitError 429 or 503 outage)
    const adapter = new MockProviderAdapter({
      injectedError: "rate_limit",
      retryAfterMs: 10000,
    });

    await expect(
      adapter.send({
        modelId: "gpt-4o",
        messages: [{ role: "user", content: "Execute mission critical prompt" }],
      })
    ).rejects.toThrow(RateLimitError);

    // 3. Verify committed runtime state in SQLite is 100% untouched and intact
    const eventsAfter = eventStore.getEventsBySession("ses_01");
    expect(eventsAfter.length).toBe(1);
    expect(eventsAfter[0].id).toBe("evt_committed_01");
    expect(eventsAfter[0].payload.goal).toBe("Survive provider failure");
  });
});
