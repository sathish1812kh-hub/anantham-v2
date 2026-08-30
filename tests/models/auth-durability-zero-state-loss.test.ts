import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { ModelRouter } from "../../src/models/model-router.js";
import { KeyPoolManager } from "../../src/models/key-pool-manager.js";
import { MockProviderAdapter } from "../../src/models/mock-provider-adapter.js";
import { GPT_4O_PROFILE } from "../../src/models/capability-profiles.js";
import { EventTypes } from "../../src/domain/event.js";

describe("P3 Gate Invariant - Zero-State-Loss under Key Exhaustion and Outages", () => {
  let engine: SqliteEngine;
  let eventStore: EventStore;
  let router: ModelRouter;
  let poolManager: KeyPoolManager;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    new MigrationEngine(engine).migrate();

    const now = new Date().toISOString();
    new ProjectRepository(engine).save({
      id: "prj_auth_01",
      name: "Project Auth",
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
      id: "ses_auth_01",
      projectId: "prj_auth_01",
      name: "Session Auth",
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

    poolManager = new KeyPoolManager();
    router = new ModelRouter({ keyPoolManager: poolManager });

    router.registerCandidate(
      {
        modelId: "gpt-4o",
        providerId: "openai",
        profile: GPT_4O_PROFILE,
        priority: 10,
      },
      new MockProviderAdapter({ providerId: "openai" })
    );
  });

  afterEach(() => {
    engine.close();
  });

  it("P3 GATE INVARIANT: Catastrophic key pool exhaustion preserves 100% committed SQLite state", async () => {
    // 1. Commit authoritative task start event
    eventStore.append({
      id: "evt_task_start_auth",
      schemaVersion: 1,
      projectId: "prj_auth_01",
      sessionId: "ses_auth_01",
      type: EventTypes.TASK_STARTED,
      actor: "user",
      timestamp: new Date().toISOString(),
      payload: { goal: "Verify SQLite persistence safety under key exhaustion" },
    });

    expect(eventStore.getEventsBySession("ses_auth_01").length).toBe(1);

    // 2. Execute router where 0 keys are in pool (exhaustion)
    await expect(
      router.execute(
        {
          modelId: "gpt-4o",
          messages: [{ role: "user", content: "Prompt with exhausted key pool" }],
        },
        {
          requirements: { requiredInputs: ["text"] },
          maxAttempts: 1,
        }
      )
    ).rejects.toThrow();

    // 3. Verify SQLite event store was not corrupted or modified
    const events = eventStore.getEventsBySession("ses_auth_01");
    expect(events.length).toBe(1);
    expect(events[0].id).toBe("evt_task_start_auth");
    expect(events[0].type).toBe(EventTypes.TASK_STARTED);
  });
});
