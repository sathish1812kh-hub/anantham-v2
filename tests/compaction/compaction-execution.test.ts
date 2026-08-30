import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { ContextEngine } from "../../src/context/context-engine.js";
import { CompactionEngine } from "../../src/compaction/compaction-engine.js";
import { CompactionResultSchema } from "../../src/compaction/compaction-types.js";

describe("CompactionEngine - /compact Execution", () => {
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

  it("compacts large context into structured summary and emits CONTEXT_COMPACTED event", async () => {
    const initialPlan = await ContextEngine.assembleContext({
      sessionId: "ses_01",
      projectId: "prj_01",
      systemPrompt: "You are the Anantham Core Orchestrator.",
      modelProfile: {
        modelId: "gpt-4o",
        supportedModalities: ["text"],
      },
      candidates: [
        {
          id: "item_task",
          sourceType: "task",
          sourceId: "task_01",
          rawContent: "Active goal: Complete P2.5 Compaction Engine with zero history loss.",
          priority: "CRITICAL",
          authority: "project-instruction",
          selectedBecause: "Current task definition",
        },
        {
          id: "item_log_1",
          sourceType: "history",
          sourceId: "msg_01",
          rawContent: "Detailed debugging log entry 1\n".repeat(50),
          priority: "NORMAL",
          authority: "user",
          selectedBecause: "Previous user turn",
        },
        {
          id: "item_log_2",
          sourceType: "history",
          sourceId: "msg_02",
          rawContent: "Detailed debugging log entry 2\n".repeat(50),
          priority: "NORMAL",
          authority: "user",
          selectedBecause: "Previous agent response",
        },
      ],
    });

    expect(initialPlan.estimatedTokens).toBeGreaterThan(300);

    const result = await compactionEngine.compact({
      sessionId: "ses_01",
      projectId: "prj_01",
      currentPlan: initialPlan,
    });

    expect(result.compactionId).toBeDefined();
    expect(result.tokensAfter).toBeLessThan(result.tokensBefore);
    expect(result.summary.objective).toContain("Complete P2.5 Compaction Engine");
    expect(result.compactedPlan.items.some((i) => i.sourceId.startsWith("compaction_summary_"))).toBe(true);

    const validated = CompactionResultSchema.parse(result);
    expect(validated.compactionId).toBe(result.compactionId);
  });
});
