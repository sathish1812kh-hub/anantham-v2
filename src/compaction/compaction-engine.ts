import { randomUUID } from "node:crypto";
import { ContextEngine, type CandidateContextItem } from "../context/context-engine.js";
import { EventTypes, type HarnessEvent } from "../domain/event.js";
import type { ContextPlan } from "../domain/context.js";
import type { EventStore } from "../event-state/event-store.js";
import {
  CompactionPreviewSchema,
  CompactionResultSchema,
  CompactionSummarySchema,
  type CompactionPreview,
  type CompactionResult,
  type CompactionSummary,
} from "./compaction-types.js";

export interface CompactionOptions {
  customObjective?: string;
  customConstraints?: string[];
  maxOutputTokens?: number;
}

export interface ExecuteCompactionParams {
  sessionId: string;
  projectId: string;
  currentPlan: ContextPlan;
  options?: CompactionOptions;
  actorId?: string;
}

export interface AutoCompactParams {
  sessionId: string;
  projectId: string;
  currentPlan: ContextPlan;
  thresholdTokens: number;
  options?: CompactionOptions;
}

export class CompactionEngine {
  private readonly eventStore: EventStore;
  private readonly undoSnapshots: Map<string, ContextPlan> = new Map();

  constructor(eventStore: EventStore) {
    this.eventStore = eventStore;
  }

  /**
   * Generates a non-destructive preview of what compaction will achieve without mutating state.
   * PRD Part 1 Section 80.
   */
  public preview(currentPlan: ContextPlan, _options?: CompactionOptions): CompactionPreview {
    let preservedCount = 0;
    let summarizedCount = 0;
    let omittedCount = 0;

    for (const item of currentPlan.items) {
      if (item.priority === "CRITICAL" || item.sourceType === "system") {
        preservedCount++;
      } else if (item.priority === "HIGH" || item.priority === "NORMAL") {
        summarizedCount++;
      } else {
        omittedCount++;
      }
    }

    // Estimated structured summary tokens (~350 tokens)
    const estimatedSummaryTokens = 350;
    const systemTokens = currentPlan.items
      .filter((i) => i.sourceType === "system")
      .reduce((sum, i) => sum + i.estimatedTokens, 0);

    const projectedTokens = systemTokens + estimatedSummaryTokens;
    const estimatedSavings = Math.max(0, currentPlan.estimatedTokens - projectedTokens);

    const warnings: string[] = [];
    if (currentPlan.items.length === 0) {
      warnings.push("ContextPlan is empty; compaction will have no effect.");
    }
    if (currentPlan.estimatedTokens < 500) {
      warnings.push("Context size is already very small; compaction may yield negligible token savings.");
    }

    const previewData: CompactionPreview = {
      currentTokens: currentPlan.estimatedTokens,
      projectedTokens,
      estimatedSavings,
      preservedItemCount: preservedCount,
      summarizedItemCount: summarizedCount,
      omittedItemCount: omittedCount,
      warnings,
    };

    return Object.freeze(CompactionPreviewSchema.parse(previewData));
  }

  /**
   * Executes deterministic session compaction.
   * Emits an immutable 'context.compacted' event to EventStore and returns a compacted ContextPlan.
   * PRD Part 1 Sections 79-82.
   */
  public async compact(params: ExecuteCompactionParams): Promise<CompactionResult> {
    const compactionId = `cmp_${randomUUID().slice(0, 12)}`;
    const now = new Date().toISOString();

    // 1. Save rollback snapshot for undo
    this.undoSnapshots.set(params.sessionId, params.currentPlan);

    // 2. Extract facts, decisions, unresolved items, and artifacts from current context
    const facts: string[] = [];
    const decisions: string[] = [];
    const constraints: string[] = [...(params.options?.customConstraints || [])];
    const unresolved: string[] = [];
    const artifactReferences: Array<{ artifactId: string; uri?: string; description?: string }> = [];
    const sourceEventIds: string[] = [];

    let activeObjective = params.options?.customObjective || "Maintain task progress and invariants.";
    let activeState = "Compacted active session state.";

    for (const item of params.currentPlan.items) {
      sourceEventIds.push(item.id);

      if (item.sourceType === "task" && item.priority === "CRITICAL") {
        if (item.content) {
          activeObjective = item.content.slice(0, 200);
          activeState = `Active task invariant: ${activeObjective}`;
        }
      }

      if (item.sourceType === "artifact") {
        artifactReferences.push({
          artifactId: item.sourceId,
          uri: item.uri,
          description: item.selectedBecause,
        });
      }

      if (item.content) {
        if (/decision|agreed|chosen|selected/i.test(item.content)) {
          decisions.push(item.content.slice(0, 150));
        } else if (/error|fail|unresolved|blocked/i.test(item.content)) {
          unresolved.push(item.content.slice(0, 150));
        } else if (/constraint|invariant|must not|must/i.test(item.content)) {
          constraints.push(item.content.slice(0, 150));
        } else {
          facts.push(`Preserved fact from ${item.sourceType} (${item.sourceId})`);
        }
      }
    }

    const summary: CompactionSummary = {
      objective: activeObjective,
      facts: facts.slice(0, 10),
      decisions: decisions.slice(0, 10),
      constraints: Array.from(new Set(constraints)).slice(0, 10),
      currentState: activeState,
      unresolved: unresolved.slice(0, 10),
      artifactReferences,
      provenance: {
        sourceEventIds,
        compactedAt: now,
      },
      pendingActions: ["Resume active task execution from compacted summary."],
    };

    const validatedSummary = CompactionSummarySchema.parse(summary);
    const summaryText = JSON.stringify(validatedSummary, null, 2);

    // 3. Assemble new ContextPlan with CompactionSummary as a CRITICAL item
    const summaryCandidate: CandidateContextItem = {
      id: `ctx_summary_${compactionId}`,
      sourceType: "memory",
      sourceId: `compaction_summary_${compactionId}`,
      rawContent: `[COMPACTED SESSION SUMMARY]\n${summaryText}`,
      priority: "CRITICAL",
      authority: "system",
      projectId: params.projectId,
      selectedBecause: "Authoritative structured compaction summary replacing historical raw messages.",
      metadata: { compactionId },
    };

    // Retain original system prompts
    const systemItem = params.currentPlan.items.find((i) => i.sourceType === "system");

    const compactedPlan = await ContextEngine.assembleContext({
      sessionId: params.sessionId,
      projectId: params.projectId,
      modelProfile: {
        modelId: "default",
        supportedModalities: ["text"],
      },
      systemPrompt: systemItem?.content,
      candidates: [summaryCandidate],
      checkpointSource: params.currentPlan.checkpointSource,
    });

    // 4. Emit immutable 'context.compacted' event to EventStore (History Preservation!)
    const eventId = `evt_cmp_${randomUUID().slice(0, 12)}`;
    const event: HarnessEvent = {
      id: eventId,
      schemaVersion: 1,
      projectId: params.projectId,
      sessionId: params.sessionId,
      type: EventTypes.CONTEXT_COMPACTED,
      actor: "system",
      timestamp: now,
      payload: {
        compactionId,
        tokensBefore: params.currentPlan.estimatedTokens,
        tokensAfter: compactedPlan.estimatedTokens,
        summary: validatedSummary,
      },
    };

    this.eventStore.append(event);

    const result: CompactionResult = {
      compactionId,
      sessionId: params.sessionId,
      compactedPlan,
      summary: validatedSummary,
      tokensBefore: params.currentPlan.estimatedTokens,
      tokensAfter: compactedPlan.estimatedTokens,
      eventId,
    };

    return Object.freeze(CompactionResultSchema.parse(result));
  }

  /**
   * Restores the previous ContextPlan prior to compaction.
   * Critical: Authoritative event history in EventStore remains completely untouched.
   * PRD Part 1 Section 81.
   */
  public async undo(sessionId: string): Promise<ContextPlan> {
    const priorPlan = this.undoSnapshots.get(sessionId);
    if (!priorPlan) {
      throw new Error(`No undo snapshot found for session '${sessionId}'.`);
    }

    this.undoSnapshots.delete(sessionId);
    return priorPlan;
  }

  /**
   * Automatically triggers compaction if the current ContextPlan exceeds the configured token threshold.
   * PRD Part 1 Section 82.
   */
  public async autoCompact(params: AutoCompactParams): Promise<CompactionResult | null> {
    if (params.currentPlan.estimatedTokens >= params.thresholdTokens) {
      // Check if already compacted to prevent loops
      const hasSummary = params.currentPlan.items.some(
        (i) => i.sourceId.startsWith("compaction_summary_")
      );
      if (hasSummary && params.currentPlan.items.length <= 2) {
        return null; // Already maximally compacted
      }

      return this.compact({
        sessionId: params.sessionId,
        projectId: params.projectId,
        currentPlan: params.currentPlan,
        options: params.options,
      });
    }

    return null;
  }
}
