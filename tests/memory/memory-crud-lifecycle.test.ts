import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { MemoryManager } from "../../src/memory/memory-manager.js";
import { MemoryRepository } from "../../src/persistence/repositories/memory-repository.js";
import { EventTypes } from "../../src/domain/event.js";

describe("MemoryManager - CRUD Lifecycle", () => {
  let engine: SqliteEngine;
  let eventStore: EventStore;
  let memoryManager: MemoryManager;
  let memoryRepo: MemoryRepository;

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
    memoryRepo = new MemoryRepository(engine);
    memoryManager = new MemoryManager(engine, eventStore);
  });

  afterEach(() => {
    engine.close();
  });

  it("persists memory item to SQLite, updates FTS, and emits memory.written event", async () => {
    const now = new Date().toISOString();
    const item = await memoryManager.saveMemory({
      id: "mem_01",
      scope: "project",
      projectId: "prj_01",
      sessionId: "ses_01",
      type: "architecture-fact",
      content: "The project uses SQLite in WAL mode with synchronous=FULL.",
      confidence: 0.95,
      priority: "HIGH",
      sourceEventIds: ["evt_01"],
      createdAt: now,
      sensitivity: "normal",
      tags: ["sqlite", "durability", "wal"],
    });

    expect(item.id).toBe("mem_01");

    // Check authoritative SQLite repository
    const stored = memoryRepo.findById("mem_01");
    expect(stored).not.toBeNull();
    expect(stored?.content).toContain("synchronous=FULL");

    // Check EventStore event emission
    const events = eventStore.getEventsBySession("ses_01");
    expect(events.length).toBe(1);
    expect(events[0].type).toBe(EventTypes.MEMORY_WRITTEN);
    expect(events[0].payload.memoryId).toBe("mem_01");
  });

  it("deletes memory item from SQLite and FTS, and emits memory.deleted event", async () => {
    const now = new Date().toISOString();
    await memoryManager.saveMemory({
      id: "mem_02",
      scope: "session",
      projectId: "prj_01",
      sessionId: "ses_01",
      type: "temporary-note",
      content: "Temporary session state note.",
      confidence: 0.8,
      priority: "LOW",
      sourceEventIds: ["evt_02"],
      createdAt: now,
      sensitivity: "public",
    });

    const deleted = await memoryManager.deleteMemory("mem_02");
    expect(deleted).toBe(true);

    expect(memoryRepo.findById("mem_02")).toBeNull();

    const events = eventStore.getEventsBySession("ses_01");
    expect(events.length).toBe(2);
    expect(events[1].type).toBe(EventTypes.MEMORY_DELETED);
    expect(events[1].payload.memoryId).toBe("mem_02");
  });
});
