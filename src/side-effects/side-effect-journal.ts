import crypto from "node:crypto";
import {
  type SideEffectCategory,
  type OutcomeCertainty,
  type SideEffectJournalEntry,
} from "../domain/side-effect.js";
import { type EventStore } from "../event-state/event-store.js";
import { EventTypes } from "../domain/event.js";

export interface RecordSideEffectOptions {
  journalId?: string;
  projectId: string;
  sessionId?: string;
  taskId?: string;
  callId: string;
  toolName: string;
  category: SideEffectCategory;
  outcomeCertainty: OutcomeCertainty;
  idempotencyKey?: string;
  args: Record<string, unknown>;
  responseStatus?: string;
  attemptNumber?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Anantham V2 — Authoritative External Side Effect Journal
 * PRD Part 2 Section 241 & PRD Part 1 Section 85
 */
export class SideEffectJournal {
  private readonly entries = new Map<string, SideEffectJournalEntry>();
  private readonly eventStore?: EventStore;

  constructor(options: { eventStore?: EventStore } = {}) {
    this.eventStore = options.eventStore;
  }

  public computeRequestHash(toolName: string, args: Record<string, unknown>): string {
    const serialized = JSON.stringify({ toolName, args }, Object.keys(args).sort());
    return crypto.createHash("sha256").update(serialized).digest("hex");
  }

  public computeIdempotencyKey(
    projectId: string,
    toolName: string,
    args: Record<string, unknown>,
    taskId?: string
  ): string {
    const hash = this.computeRequestHash(toolName, args);
    return `${projectId}:${taskId || "default"}:${toolName}:${hash.slice(0, 16)}`;
  }

  public record(options: RecordSideEffectOptions): SideEffectJournalEntry {
    const journalId = options.journalId || `jnl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const requestHash = this.computeRequestHash(options.toolName, options.args);
    const now = new Date().toISOString();

    const entry: SideEffectJournalEntry = {
      journalId,
      projectId: options.projectId,
      sessionId: options.sessionId,
      taskId: options.taskId,
      callId: options.callId,
      toolName: options.toolName,
      category: options.category,
      outcomeCertainty: options.outcomeCertainty,
      idempotencyKey: options.idempotencyKey,
      requestHash,
      responseStatus: options.responseStatus,
      attemptNumber: options.attemptNumber || 1,
      executedAt: now,
      metadata: options.metadata,
    };

    this.entries.set(journalId, entry);

    if (this.eventStore) {
      let eventType = EventTypes.SIDE_EFFECT_COMPLETED;
      if (options.outcomeCertainty === "unknown") {
        eventType = EventTypes.SIDE_EFFECT_UNKNOWN;
      } else if (options.outcomeCertainty === "known_failed") {
        eventType = EventTypes.SIDE_EFFECT_FAILED;
      }

      this.eventStore.append({
        id: `evt_se_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        schemaVersion: 1,
        projectId: options.projectId,
        type: eventType,
        actor: "system",
        timestamp: now,
        payload: {
          journalId,
          toolName: options.toolName,
          category: options.category,
          outcomeCertainty: options.outcomeCertainty,
          idempotencyKey: options.idempotencyKey,
          requestHash,
          responseStatus: options.responseStatus,
          attemptNumber: entry.attemptNumber,
        },
      });
    }

    return entry;
  }

  public getEntry(journalId: string): SideEffectJournalEntry | undefined {
    return this.entries.get(journalId);
  }

  public getEntriesByProject(projectId: string): SideEffectJournalEntry[] {
    return Array.from(this.entries.values()).filter((e) => e.projectId === projectId);
  }

  public findByIdempotencyKey(key: string): SideEffectJournalEntry | undefined {
    return Array.from(this.entries.values()).find((e) => e.idempotencyKey === key);
  }
}
