import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { ContextEngine } from "../../src/context/context-engine.js";
import { CompactionEngine } from "../../src/compaction/compaction-engine.js";

describe("CompactionEngine - Auto-Compact Triggers", () => {
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
      id: "ses_auto",
      projectId: "prj_01",
      name: "Session Auto",
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

  it("triggers auto-compaction when tokens exceed threshold and ignores when below", async () => {
    const smallPlan = await ContextEngine.assembleContext({
      sessionId: "ses_auto",
      projectId: "prj_01",
      modelProfile: { modelId: "gpt-4o", supportedModalities: ["text"] },
      candidates: [
        {
          id: "item_small",
          sourceType: "task",
          sourceId: "task_01",
          rawContent: "Small task with enough text to exceed token threshold for testing auto-compaction trigger behavior.",
          priority: "CRITICAL",
          authority: "project-instruction",
          selectedBecause: "Small task",
        },
      ],
    });

    // Below threshold -> returns null
    const resultBelow = await compactionEngine.autoCompact({
      sessionId: "ses_auto",
      projectId: "prj_01",
      currentPlan: smallPlan,
      thresholdTokens: 10000,
    });
    expect(resultBelow).toBeNull();

    // Above threshold -> returns CompactionResult
    const resultAbove = await compactionEngine.autoCompact({
      sessionId: "ses_auto",
      projectId: "prj_01",
      currentPlan: smallPlan,
      thresholdTokens: 5,
    });
    expect(resultAbove).not.toBeNull();
    expect(resultAbove?.compactionId).toBeDefined();
  });
});
