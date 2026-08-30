import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { MemoryManager } from "../../src/memory/memory-manager.js";
import { MemoryRetrievalEngine } from "../../src/memory/memory-retrieval-engine.js";

describe("MemoryRetrievalEngine - FTS5 Search & Composite Ranking", () => {
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

  it("ranks results deterministically by BM25, confidence, and priority", async () => {
    const now = new Date().toISOString();

    // Item 1: High priority and high confidence
    await memoryManager.saveMemory({
      id: "mem_critical_wal",
      scope: "project",
      projectId: "prj_01",
      sessionId: "ses_01",
      type: "architecture",
      content: "SQLite WAL mode with synchronous FULL ensures RPO 0 crash durability.",
      confidence: 1.0,
      priority: "CRITICAL",
      sourceEventIds: ["evt_01"],
      createdAt: now,
      sensitivity: "normal",
      tags: ["sqlite", "durability", "wal"],
    });

    // Item 2: Low priority and lower confidence
    await memoryManager.saveMemory({
      id: "mem_low_sqlite",
      scope: "project",
      projectId: "prj_01",
      sessionId: "ses_01",
      type: "note",
      content: "SQLite is lightweight and embedded.",
      confidence: 0.5,
      priority: "LOW",
      sourceEventIds: ["evt_02"],
      createdAt: now,
      sensitivity: "normal",
      tags: ["sqlite"],
    });

    const results = await retrievalEngine.search({
      query: "SQLite durability",
      projectId: "prj_01",
    });

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].item.id).toBe("mem_critical_wal");
    expect(results[0].score).toBeGreaterThan(0.5);
  });

  it("filters out items that exceed maxSensitivity parameter", async () => {
    const now = new Date().toISOString();

    await memoryManager.saveMemory({
      id: "mem_secret",
      scope: "project",
      projectId: "prj_01",
      sessionId: "ses_01",
      type: "auth",
      content: "Authentication encryption token guidelines.",
      confidence: 1.0,
      priority: "HIGH",
      sourceEventIds: ["evt_sec"],
      createdAt: now,
      sensitivity: "secret",
    });

    // Search with maxSensitivity: "normal" -> secret item must be excluded
    const filteredResults = await retrievalEngine.search({
      query: "Authentication encryption",
      projectId: "prj_01",
      maxSensitivity: "normal",
    });

    expect(filteredResults.length).toBe(0);
  });
});
