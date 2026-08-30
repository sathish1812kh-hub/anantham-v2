import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { MemoryManager } from "../../src/memory/memory-manager.js";
import { MemoryIndexManager } from "../../src/memory/memory-index-manager.js";
import { MemoryRetrievalEngine } from "../../src/memory/memory-retrieval-engine.js";

describe("MemoryIndexManager - Index Rebuildability Invariant", () => {
  let engine: SqliteEngine;
  let eventStore: EventStore;
  let memoryManager: MemoryManager;
  let indexManager: MemoryIndexManager;
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
    indexManager = new MemoryIndexManager(engine);
    retrievalEngine = new MemoryRetrievalEngine(engine);
  });

  afterEach(() => {
    engine.close();
  });

  it("INVARIANT 2: Index can be completely destroyed and rebuilt from authoritative memory_items", async () => {
    const now = new Date().toISOString();

    for (let i = 1; i <= 5; i++) {
      await memoryManager.saveMemory({
        id: `mem_item_${i}`,
        scope: "project",
        projectId: "prj_01",
        sessionId: "ses_01",
        type: "concept",
        content: `Deterministic indexing and retrieval test item number ${i}.`,
        confidence: 0.9,
        priority: "NORMAL",
        sourceEventIds: [`evt_${i}`],
        createdAt: now,
        sensitivity: "normal",
        tags: ["rebuild", "fts"],
      });
    }

    const integrityBefore = indexManager.verifyIndexIntegrity();
    expect(integrityBefore.isValid).toBe(true);
    expect(integrityBefore.actualCount).toBe(5);

    // 1. Manually corrupt / wipe the FTS5 virtual table
    engine.raw.exec("DELETE FROM memory_fts;");

    const integrityCorrupted = indexManager.verifyIndexIntegrity();
    expect(integrityCorrupted.isValid).toBe(false);
    expect(integrityCorrupted.actualCount).toBe(0);

    // Search now returns 0 results
    const resultsCorrupted = await retrievalEngine.search({
      query: "Deterministic indexing",
      projectId: "prj_01",
    });
    expect(resultsCorrupted.length).toBe(0);

    // 2. Rebuild index from authoritative SQLite source
    const rebuildReport = indexManager.rebuildIndex();
    expect(rebuildReport.indexedCount).toBe(5);

    const integrityRestored = indexManager.verifyIndexIntegrity();
    expect(integrityRestored.isValid).toBe(true);
    expect(integrityRestored.actualCount).toBe(5);

    // 3. Search works again with full accuracy
    const resultsRestored = await retrievalEngine.search({
      query: "Deterministic indexing",
      projectId: "prj_01",
    });
    expect(resultsRestored.length).toBe(5);
  });
});
