import { randomUUID } from "node:crypto";
import { MemoryItemSchema, type MemoryItem } from "../domain/memory.js";
import { EventTypes, type HarnessEvent } from "../domain/event.js";
import type { SqliteEngine } from "../persistence/sqlite-engine.js";
import { MemoryRepository } from "../persistence/repositories/memory-repository.js";
import type { EventStore } from "../event-state/event-store.js";
import { MemoryIndexManager } from "./memory-index-manager.js";

export class MemoryManager {
  private readonly engine: SqliteEngine;
  private readonly memoryRepo: MemoryRepository;
  private readonly indexManager: MemoryIndexManager;
  private readonly eventStore: EventStore;

  constructor(engine: SqliteEngine, eventStore: EventStore) {
    this.engine = engine;
    this.memoryRepo = new MemoryRepository(engine);
    this.indexManager = new MemoryIndexManager(engine);
    this.eventStore = eventStore;
  }

  /**
   * Persists a validated MemoryItem to SQLite, synchronizes the FTS5 index,
   * and appends a memory.written event to the EventStore.
   * PRD Part 1 Section 63.
   */
  public async saveMemory(item: MemoryItem): Promise<MemoryItem> {
    const validated = MemoryItemSchema.parse(item);

    // 1. Transactionally persist item and index in SQLite
    this.engine.transaction(() => {
      this.memoryRepo.save(validated);
      this.indexManager.indexItem(validated);
    });

    // 2. Append event to EventStore
    const event: HarnessEvent = {
      id: `evt_mem_${randomUUID().slice(0, 12)}`,
      schemaVersion: 1,
      projectId: validated.projectId,
      sessionId: validated.sessionId,
      type: EventTypes.MEMORY_WRITTEN,
      actor: "system",
      timestamp: new Date().toISOString(),
      payload: {
        memoryId: validated.id,
        scope: validated.scope,
        type: validated.type,
        priority: validated.priority,
        confidence: validated.confidence,
        sensitivity: validated.sensitivity,
      },
    };
    this.eventStore.append(event);

    return Object.freeze(validated);
  }

  /**
   * Deletes a memory item from repository and FTS index, and emits memory.deleted event.
   */
  public async deleteMemory(id: string): Promise<boolean> {
    const existing = this.memoryRepo.findById(id);
    if (!existing) {
      return false;
    }

    this.engine.transaction(() => {
      this.memoryRepo.delete(id);
      this.indexManager.removeItem(id);
    });

    const event: HarnessEvent = {
      id: `evt_mem_del_${randomUUID().slice(0, 12)}`,
      schemaVersion: 1,
      projectId: existing.projectId,
      sessionId: existing.sessionId,
      type: EventTypes.MEMORY_DELETED,
      actor: "system",
      timestamp: new Date().toISOString(),
      payload: { memoryId: id },
    };
    this.eventStore.append(event);

    return true;
  }
}
