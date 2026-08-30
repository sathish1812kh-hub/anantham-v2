import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { ContextEngine } from "../../src/context/context-engine.js";
import { CompactionEngine } from "../../src/compaction/compaction-engine.js";

describe("CompactionEngine - /compact Undo", () => {
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
      id: "ses_undo_test",
      projectId: "prj_01",
      name: "Session Undo Test",
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

  it("restores prior ContextPlan on undo without mutating authoritative EventStore history", async () => {
    const originalPlan = await ContextEngine.assembleContext({
      sessionId: "ses_undo_test",
      projectId: "prj_01",
      modelProfile: { modelId: "gpt-4o", supportedModalities: ["text"] },
      candidates: [
        {
          id: "item_orig_1",
          sourceType: "file",
          sourceId: "file_a.ts",
          rawContent: "export const a = 1;",
          priority: "NORMAL",
          authority: "repository-content",
          selectedBecause: "Original file context",
        },
      ],
    });

    const compactionResult = await compactionEngine.compact({
      sessionId: "ses_undo_test",
      projectId: "prj_01",
      currentPlan: originalPlan,
    });

    expect(compactionResult.compactedPlan.items.length).toBe(1);
    expect(compactionResult.compactedPlan.items[0].sourceId.startsWith("compaction_summary_")).toBe(true);

    const restoredPlan = await compactionEngine.undo("ses_undo_test");

    expect(restoredPlan.items.length).toBe(originalPlan.items.length);
    expect(restoredPlan.items[0].sourceId).toBe("file_a.ts");

    const events = eventStore.getEventsBySession("ses_undo_test");
    expect(events.length).toBe(1);
  });
});
