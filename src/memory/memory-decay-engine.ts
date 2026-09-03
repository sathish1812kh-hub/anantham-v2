import { z } from "zod";
import { MemoryRepository } from "../persistence/repositories/memory-repository.js";
import { EventStore } from "../event-state/event-store.js";
import type { MemoryItem } from "../domain/memory.js";

export const FreshnessStateSchema = z.enum(["fresh", "stale", "invalidated"]);
export type FreshnessState = z.infer<typeof FreshnessStateSchema>;

export const MemoryConflictResolutionSchema = z.object({
  conflictDetected: z.boolean(),
  acceptedItemId: z.string().optional(),
  invalidatedItemIds: z.array(z.string()),
  unresolved: z.boolean(),
  rationale: z.string(),
});
export type MemoryConflictResolution = z.infer<typeof MemoryConflictResolutionSchema>;

export const MemoryDecayConfigSchema = z.object({
  halfLifeDays: z.number().positive().default(30),
  accessBoostFactor: z.number().nonnegative().default(0.05),
  maxAccessBoost: z.number().nonnegative().default(0.50),
  criticalPriorityFloor: z.number().min(0).max(1).default(0.80),
  highPriorityFloor: z.number().min(0).max(1).default(0.40),
  staleThresholdScore: z.number().min(0).max(1).default(0.20),
  pruneThresholdScore: z.number().min(0).max(1).default(0.10),
});
export type MemoryDecayConfig = z.infer<typeof MemoryDecayConfigSchema>;

export const PruneResultSchema = z.object({
  scannedCount: z.number().int().nonnegative(),
  expiredCount: z.number().int().nonnegative(),
  staleCount: z.number().int().nonnegative(),
  prunedCount: z.number().int().nonnegative(),
  prunedItemIds: z.array(z.string()),
  staleItemIds: z.array(z.string()),
  dryRun: z.boolean(),
  timestamp: z.string(),
});
export type PruneResult = z.infer<typeof PruneResultSchema>;

export interface MemoryDecayEngineOptions {
  memoryRepo: MemoryRepository;
  eventStore?: EventStore;
  config?: Partial<MemoryDecayConfig>;
}

export class MemoryDecayEngine {
  private readonly memoryRepo: MemoryRepository;
  private readonly eventStore?: EventStore;
  private readonly config: MemoryDecayConfig;
  private readonly accessCounts: Map<string, number> = new Map();

  constructor(options: MemoryDecayEngineOptions) {
    this.memoryRepo = options.memoryRepo;
    this.eventStore = options.eventStore;
    this.config = MemoryDecayConfigSchema.parse(options.config ?? {});
  }

  public recordAccess(memoryId: string): void {
    const current = this.accessCounts.get(memoryId) ?? 0;
    this.accessCounts.set(memoryId, current + 1);
  }

  public getAccessCount(memoryId: string): number {
    return this.accessCounts.get(memoryId) ?? 0;
  }

  public computeDecayedScore(
    item: MemoryItem,
    now: number = Date.now(),
    explicitAccessCount?: number
  ): number {
    const baseTime = item.lastValidatedAt
      ? Math.max(new Date(item.createdAt).getTime(), new Date(item.lastValidatedAt).getTime())
      : new Date(item.createdAt).getTime();

    const ageMs = Math.max(0, now - baseTime);
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    // Exponential half-life decay: 0.5 ^ (ageDays / halfLifeDays)
    const decayFactor = Math.pow(0.5, ageDays / this.config.halfLifeDays);

    const accessCount = explicitAccessCount ?? this.getAccessCount(item.id);
    const accessBoost = Math.min(this.config.maxAccessBoost, accessCount * this.config.accessBoostFactor);

    const rawScore = (item.confidence * decayFactor) * (1 + accessBoost);

    // Enforce priority floors
    let floor = 0;
    if (item.priority === "CRITICAL") {
      floor = this.config.criticalPriorityFloor;
    } else if (item.priority === "HIGH") {
      floor = this.config.highPriorityFloor;
    }

    return Math.max(floor, Math.min(1.0, rawScore));
  }

  public resolveConflicts(existingItem: MemoryItem, newItem: MemoryItem): MemoryConflictResolution {
    const getSourceRank = (item: MemoryItem): number => {
      const src = (item.metadata?.source as string) || (item.tags?.includes("user") ? "user" : "agent");
      if (src === "user") return 3;
      if (src === "artifact:verified" || src === "verified") return 2;
      return 1;
    };

    const existingRank = getSourceRank(existingItem);
    const newRank = getSourceRank(newItem);

    if (existingRank > newRank) {
      if (this.eventStore) {
        this.eventStore.append({
          id: "evt_mem_inv_" + Date.now(),
          schemaVersion: 1,
          projectId: newItem.projectId,
          sessionId: newItem.sessionId,
          type: "memory.invalidated",
          actor: "system",
          timestamp: new Date().toISOString(),
          payload: {
            invalidatedItemId: newItem.id,
            supersededByItemId: existingItem.id,
            reason: "Source authority rank (" + existingRank + " > " + newRank + ")",
          },
        });
      }
      return {
        conflictDetected: true,
        acceptedItemId: existingItem.id,
        invalidatedItemIds: [newItem.id],
        unresolved: false,
        rationale: "Existing memory has higher source authority (" + existingRank + " > " + newRank + ").",
      };
    } else if (newRank > existingRank) {
      if (this.eventStore) {
        this.eventStore.append({
          id: "evt_mem_inv_" + Date.now(),
          schemaVersion: 1,
          projectId: existingItem.projectId,
          sessionId: existingItem.sessionId,
          type: "memory.invalidated",
          actor: "system",
          timestamp: new Date().toISOString(),
          payload: {
            invalidatedItemId: existingItem.id,
            supersededByItemId: newItem.id,
            reason: "Source authority rank (" + newRank + " > " + existingRank + ")",
          },
        });
      }
      return {
        conflictDetected: true,
        acceptedItemId: newItem.id,
        invalidatedItemIds: [existingItem.id],
        unresolved: false,
        rationale: "New memory has higher source authority (" + newRank + " > " + existingRank + ").",
      };
    } else {
      // Same rank: break tie with recency
      const existingTime = new Date(existingItem.createdAt).getTime();
      const newTime = new Date(newItem.createdAt).getTime();

      if (newTime > existingTime) {
        return {
          conflictDetected: true,
          acceptedItemId: newItem.id,
          invalidatedItemIds: [existingItem.id],
          unresolved: false,
          rationale: "New memory has identical authority but is more recent.",
        };
      } else if (existingTime > newTime) {
        return {
          conflictDetected: true,
          acceptedItemId: existingItem.id,
          invalidatedItemIds: [newItem.id],
          unresolved: false,
          rationale: "Existing memory has identical authority and is more recent.",
        };
      } else {
        // Inconclusive: preserve both, mark unresolved
        return {
          conflictDetected: true,
          invalidatedItemIds: [],
          unresolved: true,
          rationale: "Conflicting memories have identical authority and timestamp; preserving both without silent discarding.",
        };
      }
    }
  }

  public async pruneExpiredAndStale(options?: {
    projectId?: string;
    dryRun?: boolean;
    now?: number;
  }): Promise<PruneResult> {
    const now = options?.now ?? Date.now();
    const scopes: Array<MemoryItem["scope"]> = ["working", "session", "project", "agent", "global", "episodic"];

    let scannedCount = 0;
    let expiredCount = 0;
    let staleCount = 0;
    const prunedItemIds: string[] = [];
    const staleItemIds: string[] = [];

    const allItems: MemoryItem[] = [];
    for (const scope of scopes) {
      const items = this.memoryRepo.listByScope(scope, { projectId: options?.projectId });
      allItems.push(...items);
    }

    scannedCount = allItems.length;

    for (const item of allItems) {
      let isExpired = false;
      if (item.expiresAt && new Date(item.expiresAt).getTime() <= now) {
        isExpired = true;
        expiredCount++;
      }

      const score = this.computeDecayedScore(item, now);
      const isStale = isExpired || score < this.config.staleThresholdScore;

      if (isStale) {
        staleCount++;
        staleItemIds.push(item.id);
      }

      const shouldPrune = isExpired || score < this.config.pruneThresholdScore;

      if (shouldPrune) {
        prunedItemIds.push(item.id);
        if (!options?.dryRun) {
          this.memoryRepo.delete(item.id);

          if (this.eventStore) {
            this.eventStore.append({
              id: "evt_mem_prune_" + Date.now(),
              schemaVersion: 1,
              projectId: item.projectId,
              sessionId: item.sessionId,
              type: "memory.pruned",
              actor: "system",
              timestamp: new Date(now).toISOString(),
              payload: {
                memoryId: item.id,
                score,
                isExpired,
              },
            });
          }
        }
      }
    }

    return {
      scannedCount,
      expiredCount,
      staleCount,
      prunedCount: prunedItemIds.length,
      prunedItemIds,
      staleItemIds,
      dryRun: options?.dryRun ?? false,
      timestamp: new Date(now).toISOString(),
    };
  }
}
