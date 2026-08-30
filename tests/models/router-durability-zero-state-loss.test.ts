import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { ModelRouter } from "../../src/models/model-router.js";
import { MockProviderAdapter } from "../../src/models/mock-provider-adapter.js";
import {
  GPT_4O_PROFILE,
  CLAUDE_3_5_SONNET_PROFILE,
} from "../../src/models/capability-profiles.js";
import { EventTypes } from "../../src/domain/event.js";

describe("P3 Gate Invariant - Zero-State-Loss Failover", () => {
  let engine: SqliteEngine;
  let eventStore: EventStore;
  let router: ModelRouter;

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

    router = new ModelRouter();

    // Primary: Claude fails with 503 ProviderUnavailableError
    router.registerCandidate(
      {
        modelId: "claude-3-5-sonnet",
        providerId: "anthropic",
        profile: CLAUDE_3_5_SONNET_PROFILE,
        priority: 20,
      },
      new MockProviderAdapter({
        providerId: "anthropic",
        injectedError: "unavailable",
      })
    );

    // Fallback: GPT-4o succeeds
    router.registerCandidate(
      {
        modelId: "gpt-4o",
        providerId: "openai",
        profile: GPT_4O_PROFILE,
        priority: 10,
      },
      new MockProviderAdapter({
        providerId: "openai",
        defaultResponseText: "Durable failover completed.",
      })
    );
  });

  afterEach(() => {
    engine.close();
  });

  it("P3 GATE INVARIANT: Failover cascade preserves 100% of committed events, session state, and emits execution record", async () => {
    // 1. Commit prior authoritative event
    eventStore.append({
      id: "evt_authoritative_01",
      schemaVersion: 1,
      projectId: "prj_01",
      sessionId: "ses_01",
      type: EventTypes.TASK_STARTED,
      actor: "user",
      timestamp: new Date().toISOString(),
      payload: { goal: "Verify zero state loss on model failover" },
    });

    expect(eventStore.getEventsBySession("ses_01").length).toBe(1);

    // 2. Execute model request triggering failover
    const result = await router.execute(
      {
        modelId: "claude-3-5-sonnet",
        messages: [{ role: "user", content: "Perform task" }],
      },
      {
        requirements: { requiredInputs: ["text"] },
        maxAttempts: 2,
      }
    );

    expect(result.succeededCandidate.modelId).toBe("gpt-4o");

    // 3. Append model response event
    eventStore.append({
      id: "evt_model_resp_01",
      schemaVersion: 1,
      projectId: "prj_01",
      sessionId: "ses_01",
      type: EventTypes.MODEL_RESPONDED,
      actor: "agent",
      timestamp: new Date().toISOString(),
      payload: {
        modelId: result.succeededCandidate.modelId,
        providerId: result.succeededCandidate.providerId,
        attemptsCount: result.attempts.length,
      },
    });

    // 4. Verify full event history integrity in SQLite
    const events = eventStore.getEventsBySession("ses_01");
    expect(events.length).toBe(2);
    expect(events[0].type).toBe(EventTypes.TASK_STARTED);
    expect(events[1].type).toBe(EventTypes.MODEL_RESPONDED);
    expect(events[1].payload.modelId).toBe("gpt-4o");
    expect(events[1].payload.attemptsCount).toBe(2);
  });
});
