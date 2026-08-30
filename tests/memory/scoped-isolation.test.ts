import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { MemoryManager } from "../../src/memory/memory-manager.js";
import { MemoryRetrievalEngine } from "../../src/memory/memory-retrieval-engine.js";

describe("MemoryRetrievalEngine - Scoped Boundary Isolation", () => {
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
      id: "prj_alpha",
      name: "Project Alpha",
      rootPath: "C:/alpha",
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

    projectRepo.save({
      id: "prj_beta",
      name: "Project Beta",
      rootPath: "C:/beta",
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
      id: "ses_alpha_1",
      projectId: "prj_alpha",
      name: "Session Alpha",
      branch: "main",
      status: "active",
      modelProfile: "default",
      keyPoolProfile: "default",
      mode: "interactive",
      permissions: {},
      createdAt: now,
      updatedAt: now,
    });

    sessionRepo.save({
      id: "ses_beta_1",
      projectId: "prj_beta",
      name: "Session Beta",
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

  it("INVARIANT 1: Project B cannot retrieve Project A's private memory items", async () => {
    const now = new Date().toISOString();

    // 1. Create Project Alpha memory
    await memoryManager.saveMemory({
      id: "mem_alpha_secret",
      scope: "project",
      projectId: "prj_alpha",
      sessionId: "ses_alpha_1",
      type: "secret-architecture",
      content: "Project Alpha proprietary cryptography algorithm X99.",
      confidence: 1.0,
      priority: "CRITICAL",
      sourceEventIds: ["evt_01"],
      createdAt: now,
      sensitivity: "normal",
      tags: ["crypto", "algorithm"],
    });

    // 2. Create Project Beta memory
    await memoryManager.saveMemory({
      id: "mem_beta_note",
      scope: "project",
      projectId: "prj_beta",
      sessionId: "ses_beta_1",
      type: "general-architecture",
      content: "Project Beta standard REST endpoints.",
      confidence: 0.9,
      priority: "HIGH",
      sourceEventIds: ["evt_02"],
      createdAt: now,
      sensitivity: "normal",
      tags: ["rest", "api"],
    });

    // 3. Search as Project Beta for "algorithm"
    const resultsBeta = await retrievalEngine.search({
      query: "algorithm",
      projectId: "prj_beta",
      sessionId: "ses_beta_1",
    });

    // Expect: Zero results returned (Project Alpha memory strictly isolated!)
    expect(resultsBeta.length).toBe(0);

    // 4. Search as Project Alpha for "algorithm"
    const resultsAlpha = await retrievalEngine.search({
      query: "algorithm",
      projectId: "prj_alpha",
      sessionId: "ses_alpha_1",
    });

    expect(resultsAlpha.length).toBe(1);
    expect(resultsAlpha[0].item.id).toBe("mem_alpha_secret");
  });
});
