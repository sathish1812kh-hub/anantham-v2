import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { MemoryManager } from "../../src/memory/memory-manager.js";
import { MemoryRetrievalEngine } from "../../src/memory/memory-retrieval-engine.js";
import { ContextEngine } from "../../src/context/context-engine.js";

describe("Memory Retrieval -> ContextEngine Integration", () => {
  let engine: SqliteEngine;
  let eventStore: EventStore;
  let memoryManager: MemoryManager;
  let retrievalEngine: MemoryRetrievalEngine;

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
    memoryManager = new MemoryManager(engine, eventStore);
    retrievalEngine = new MemoryRetrievalEngine(engine);
  });

  afterEach(() => {
    engine.close();
  });

  it("retrieves memory items, converts to CandidateContextItems, and packs into ContextPlan", async () => {
    const now = new Date().toISOString();

    await memoryManager.saveMemory({
      id: "mem_tool_rule",
      scope: "project",
      projectId: "prj_01",
      sessionId: "ses_01",
      type: "rule",
      content: "All tools must execute through ToolGateway.",
      confidence: 1.0,
      priority: "CRITICAL",
      sourceEventIds: ["evt_01"],
      createdAt: now,
      sensitivity: "normal",
    });

    // 1. Search memories
    const searchResults = await retrievalEngine.search({
      query: "ToolGateway",
      projectId: "prj_01",
    });

    expect(searchResults.length).toBe(1);

    // 2. Convert to context candidates
    const memoryCandidates = retrievalEngine.asCandidateContextItems(searchResults);
    expect(memoryCandidates.length).toBe(1);
    expect(memoryCandidates[0].sourceType).toBe("memory");
    expect(memoryCandidates[0].priority).toBe("CRITICAL");

    // 3. Assemble ContextPlan via ContextEngine
    const plan = await ContextEngine.assembleContext({
      sessionId: "ses_01",
      projectId: "prj_01",
      modelProfile: { modelId: "gpt-4o", supportedModalities: ["text"] },
      candidates: memoryCandidates,
    });

    expect(plan.items.length).toBe(1);
    expect(plan.items[0].content).toContain("ToolGateway");
  });
});
