import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { ContextEngine } from "../../src/context/context-engine.js";
import { CompactionEngine } from "../../src/compaction/compaction-engine.js";
import { EventTypes } from "../../src/domain/event.js";

describe("CompactionEngine - Authoritative History Preservation Invariant", () => {
  let engine: SqliteEngine;
  let eventStore: EventStore;
  let compactionEngine: CompactionEngine;

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
    compactionEngine = new CompactionEngine(eventStore);
  });

  afterEach(() => {
    engine.close();
  });

  it("INVARIANT: Compaction appends a new CONTEXT_COMPACTED event without deleting historical events", async () => {
    for (let i = 1; i <= 5; i++) {
      eventStore.append({
        id: `evt_hist_${i}`,
        schemaVersion: 1,
        projectId: "prj_01",
        sessionId: "ses_01",
        type: EventTypes.MODEL_RESPONDED,
        actor: "agent",
        timestamp: new Date().toISOString(),
        payload: { messageIndex: i },
      });
    }

    expect(eventStore.getEventsBySession("ses_01").length).toBe(5);

    const plan = await ContextEngine.assembleContext({
      sessionId: "ses_01",
      projectId: "prj_01",
      modelProfile: { modelId: "gpt-4o", supportedModalities: ["text"] },
      candidates: [
        {
          id: "item_01",
          sourceType: "history",
          sourceId: "evt_hist_1",
          rawContent: "Historical turn 1",
          priority: "NORMAL",
          authority: "user",
          selectedBecause: "Recent turn",
        },
      ],
    });

    await compactionEngine.compact({
      sessionId: "ses_01",
      projectId: "prj_01",
      currentPlan: plan,
    });

    const allEvents = eventStore.getEventsBySession("ses_01");
    expect(allEvents.length).toBe(6);
    expect(allEvents[5].type).toBe(EventTypes.CONTEXT_COMPACTED);
    expect(allEvents[0].id).toBe("evt_hist_1");
  });
});
