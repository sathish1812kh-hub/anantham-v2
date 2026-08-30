import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { ContextEngine } from "../../src/context/context-engine.js";
import { CompactionEngine } from "../../src/compaction/compaction-engine.js";

describe("CompactionEngine - /compact Preview", () => {
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

  it("calculates projected savings without mutating state or emitting events", async () => {
    const plan = await ContextEngine.assembleContext({
      sessionId: "ses_01",
      projectId: "prj_01",
      systemPrompt: "System rules",
      modelProfile: { modelId: "gpt-4o", supportedModalities: ["text"] },
      candidates: [
        {
          id: "item_crit",
          sourceType: "task",
          sourceId: "task_01",
          rawContent: "Important task constraint",
          priority: "CRITICAL",
          authority: "project-instruction",
          selectedBecause: "Critical invariant",
        },
        {
          id: "item_norm",
          sourceType: "history",
          sourceId: "msg_01",
          rawContent: "Long chat history ".repeat(100),
          priority: "NORMAL",
          authority: "user",
          selectedBecause: "Chat turn",
        },
      ],
    });

    const preview = compactionEngine.preview(plan);

    expect(preview.currentTokens).toBe(plan.estimatedTokens);
    expect(preview.projectedTokens).toBeGreaterThan(0);
    expect(preview.preservedItemCount).toBeGreaterThanOrEqual(1);
    expect(preview.summarizedItemCount).toBe(1);

    expect(eventStore.getEventsBySession("ses_01").length).toBe(0);
  });
});
