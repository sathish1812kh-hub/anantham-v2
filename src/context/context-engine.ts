import { randomUUID } from "node:crypto";
import { ContentGuards } from "../content/content-guards.js";
import { RepresentationSelector, type ModelModalityProfile } from "../content/representation-selector.js";
import type { ContentObject } from "../domain/content.js";
import type {
  ContextDecision,
  ContextItem,
  ContextOmission,
  ContextPlan,
  ContextPriority,
} from "../domain/context.js";
import { ContextPlanSchema } from "../domain/context.js";
import type { AuthorityClass } from "../domain/security.js";
import { ToolResultPruner } from "./tool-result-pruner.js";

export interface CandidateContextItem {
  id: string;
  sourceType:
    | "project"
    | "task"
    | "history"
    | "memory"
    | "file"
    | "attachment"
    | "artifact"
    | "skill"
    | "tool-schema"
    | "diagnostic"
    | "system";
  sourceId: string;
  contentObject?: ContentObject;
  rawContent?: string;
  uri?: string;
  priority: ContextPriority;
  authority: AuthorityClass;
  projectId?: string;
  metadata?: Record<string, unknown>;
  selectedBecause: string;
}

export interface ToolSchemaEntry {
  name: string;
  schema: Record<string, unknown>;
  estimatedTokens?: number;
}

export interface ToolResultEntry {
  toolName: string;
  rawOutput: string | Record<string, unknown>;
  artifactUri?: string;
}

export interface ContextAssemblyRequest {
  sessionId: string;
  projectId: string;
  modelProfile: ModelModalityProfile;
  maxTotalTokens?: number;
  systemPrompt?: string;
  candidates: CandidateContextItem[];
  toolSchemas?: ToolSchemaEntry[];
  toolResults?: ToolResultEntry[];
  checkpointSource?: string;
}

export interface ContextInspectionReport {
  planId: string;
  totalEstimatedTokens: number;
  budget: number;
  remainingTokens: number;
  selectedItemsCount: number;
  omittedItemsCount: number;
  tokenBreakdown: {
    system: number;
    toolSchemas: number;
    items: number;
    toolResults: number;
  };
  selectedItems: Array<{
    id: string;
    sourceType: string;
    priority: string;
    tokens: number;
    because: string;
    authority: string;
  }>;
  omittedItems: Array<{
    sourceId: string;
    reason: string;
    tokens: number;
  }>;
  decisions: Array<{
    decisionType: string;
    rationale: string;
    affectedItems: string[];
  }>;
}

export class ContextEngine {
  private static readonly DEFAULT_MAX_TOKENS = 128000;
  private static readonly PRIORITY_WEIGHTS: Record<ContextPriority, number> = {
    CRITICAL: 100,
    HIGH: 75,
    NORMAL: 50,
    LOW: 25,
    DROP: 0,
  };

  /**
   * Assembles a deterministic, capability-matched, and security-validated ContextPlan.
   * PRD Part 1 Sections 76-78 & PRD Part 2 Section 50.
   */
  public static async assembleContext(req: ContextAssemblyRequest): Promise<ContextPlan> {
    const maxTokens = req.maxTotalTokens ?? this.DEFAULT_MAX_TOKENS;
    const planId = `cpl_${randomUUID().slice(0, 12)}`;
    const now = new Date().toISOString();

    const items: ContextItem[] = [];
    const omitted: ContextOmission[] = [];
    const decisions: ContextDecision[] = [];

    let currentTokens = 0;
    let systemTokens = 0;
    let toolSchemaTokens = 0;
    let toolResultTokens = 0;
    let itemTokens = 0;

    // 1. Process System Prompt (Always Highest Priority / Authority: system)
    if (req.systemPrompt) {
      systemTokens = ContentGuards.estimateTokens(req.systemPrompt);
      if (currentTokens + systemTokens <= maxTokens) {
        items.push({
          id: `ctx_sys_${randomUUID().slice(0, 8)}`,
          sourceType: "system",
          sourceId: "sys_core_prompt",
          representationType: "text",
          priority: "CRITICAL",
          estimatedTokens: systemTokens,
          selectedBecause: "Root system prompt and operational instructions",
          authority: "system",
          content: req.systemPrompt,
        });
        currentTokens += systemTokens;
        decisions.push({
          decisionType: "include",
          rationale: "Included authoritative system prompt",
          affectedItems: ["sys_core_prompt"],
        });
      }
    }

    // 2. Process Tool Schemas
    if (req.toolSchemas && req.toolSchemas.length > 0) {
      for (const tool of req.toolSchemas) {
        const schemaString = JSON.stringify(tool.schema);
        const tokens = tool.estimatedTokens ?? ContentGuards.estimateTokens(schemaString);

        if (currentTokens + tokens <= maxTokens) {
          items.push({
            id: `ctx_tool_${tool.name}`,
            sourceType: "tool-schema",
            sourceId: `tool_${tool.name}`,
            representationType: "json",
            priority: "HIGH",
            estimatedTokens: tokens,
            selectedBecause: `Tool schema for '${tool.name}'`,
            authority: "system",
            content: schemaString,
            metadata: { toolName: tool.name },
          });
          currentTokens += tokens;
          toolSchemaTokens += tokens;
        } else {
          omitted.push({
            sourceId: `tool_${tool.name}`,
            reason: "Tool schema exceeded context token budget",
            estimatedTokens: tokens,
          });
          decisions.push({
            decisionType: "defer-schema",
            rationale: `Deferred tool schema '${tool.name}' due to budget constraints`,
            affectedItems: [`tool_${tool.name}`],
          });
        }
      }
    }

    // 3. Process Tool Results with Pruning
    if (req.toolResults && req.toolResults.length > 0) {
      for (const res of req.toolResults) {
        const pruneResult = ToolResultPruner.prune(res.rawOutput, {
          maxChars: 4000,
          artifactRefUri: res.artifactUri,
        });

        if (pruneResult.wasPruned) {
          decisions.push({
            decisionType: "prune-tool-result",
            rationale: `Pruned oversized output for tool '${res.toolName}' while preserving errors and diagnostics`,
            affectedItems: [`tool_res_${res.toolName}`],
          });
        }

        if (currentTokens + pruneResult.estimatedTokens <= maxTokens) {
          items.push({
            id: `ctx_res_${res.toolName}_${randomUUID().slice(0, 6)}`,
            sourceType: "task",
            sourceId: `tool_res_${res.toolName}`,
            representationType: "text",
            priority: "HIGH",
            estimatedTokens: pruneResult.estimatedTokens,
            selectedBecause: `Execution result from tool '${res.toolName}'`,
            authority: "tool-output",
            content: pruneResult.content,
            uri: res.artifactUri,
          });
          currentTokens += pruneResult.estimatedTokens;
          toolResultTokens += pruneResult.estimatedTokens;
        } else {
          omitted.push({
            sourceId: `tool_res_${res.toolName}`,
            reason: "Pruned tool result exceeded context token budget",
            estimatedTokens: pruneResult.estimatedTokens,
          });
        }
      }
    }

    // 4. Filter, Capability-Match, and Rank Candidates
    const scoredCandidates: Array<{
      candidate: CandidateContextItem;
      representationType: string;
      content?: string;
      uri?: string;
      tokens: number;
      score: number;
    }> = [];

    for (const cand of req.candidates) {
      // 4a. Project Isolation & Boundary Guard
      if (cand.projectId && cand.projectId !== req.projectId) {
        omitted.push({
          sourceId: cand.sourceId,
          reason: `Cross-project boundary violation: candidate project '${cand.projectId}' != requested '${req.projectId}'`,
          estimatedTokens: 0,
        });
        decisions.push({
          decisionType: "omit",
          rationale: `Rejected cross-project candidate '${cand.sourceId}'`,
          affectedItems: [cand.sourceId],
        });
        continue;
      }

      // 4b. Explicit DROP priority
      if (cand.priority === "DROP") {
        omitted.push({
          sourceId: cand.sourceId,
          reason: "Explicit DROP priority assigned",
          estimatedTokens: 0,
        });
        continue;
      }

      // 4c. Modality & Representation Resolution
      let repType = "text";
      let contentStr = cand.rawContent;
      let uri = cand.uri;
      let tokens = 0;

      if (cand.contentObject) {
        try {
          const selection = RepresentationSelector.selectOptimalRepresentation(
            cand.contentObject,
            req.modelProfile
          );
          repType = selection.representation.type;
          tokens = selection.estimatedTokens;
          if (typeof selection.representation.data === "string") {
            contentStr = selection.representation.data;
          } else if (selection.representation.uri) {
            uri = selection.representation.uri;
          }
        } catch {
          omitted.push({
            sourceId: cand.sourceId,
            reason: "No compatible representation found for model modality profile",
            estimatedTokens: 0,
          });
          decisions.push({
            decisionType: "omit",
            rationale: `Omitted candidate '${cand.sourceId}' due to unsupported modality`,
            affectedItems: [cand.sourceId],
          });
          continue;
        }
      } else if (contentStr) {
        tokens = ContentGuards.estimateTokens(contentStr);
      }

      const score = this.PRIORITY_WEIGHTS[cand.priority] ?? 50;

      scoredCandidates.push({
        candidate: cand,
        representationType: repType,
        content: contentStr,
        uri,
        tokens,
        score,
      });
    }

    // 5. Deterministic Sort: Highest Score first, then deterministic tie-breaker by sourceId
    scoredCandidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.candidate.sourceId.localeCompare(b.candidate.sourceId);
    });

    // 6. Token Budget Allocation for Candidates
    for (const scored of scoredCandidates) {
      if (currentTokens + scored.tokens <= maxTokens) {
        items.push({
          id: scored.candidate.id || `ctx_${randomUUID().slice(0, 8)}`,
          sourceType: scored.candidate.sourceType,
          sourceId: scored.candidate.sourceId,
          representationType: scored.representationType,
          priority: scored.candidate.priority,
          estimatedTokens: scored.tokens,
          selectedBecause: scored.candidate.selectedBecause,
          authority: scored.candidate.authority,
          content: scored.content,
          uri: scored.uri,
          metadata: scored.candidate.metadata,
        });
        currentTokens += scored.tokens;
        itemTokens += scored.tokens;
        decisions.push({
          decisionType: "include",
          rationale: `Selected item '${scored.candidate.sourceId}' (priority: ${scored.candidate.priority})`,
          affectedItems: [scored.candidate.sourceId],
        });
      } else {
        omitted.push({
          sourceId: scored.candidate.sourceId,
          reason: `Exceeded context token budget (needed ${scored.tokens} tokens, remaining ${maxTokens - currentTokens})`,
          estimatedTokens: scored.tokens,
        });
        decisions.push({
          decisionType: "omit",
          rationale: `Omitted item '${scored.candidate.sourceId}' due to token budget overflow`,
          affectedItems: [scored.candidate.sourceId],
        });
      }
    }

    // 7. Assemble and Validate ContextPlan
    const plan: ContextPlan = {
      id: planId,
      items,
      estimatedTokens: currentTokens,
      modalityUsage: {
        text: itemTokens + systemTokens + toolSchemaTokens + toolResultTokens,
      },
      omitted,
      decisions,
      checkpointSource: req.checkpointSource,
      createdAt: now,
    };

    return Object.freeze(ContextPlanSchema.parse(plan));
  }

  /**
   * Generates an operational inspection report for the /context command.
   * PRD Part 1 Section 77.
   */
  public static inspectContext(plan: ContextPlan, budget = 128000): ContextInspectionReport {
    let systemTokens = 0;
    let toolSchemasTokens = 0;
    let toolResultsTokens = 0;
    let itemTokens = 0;

    for (const item of plan.items) {
      if (item.sourceType === "system") {
        systemTokens += item.estimatedTokens;
      } else if (item.sourceType === "tool-schema") {
        toolSchemasTokens += item.estimatedTokens;
      } else if (item.authority === "tool-output") {
        toolResultsTokens += item.estimatedTokens;
      } else {
        itemTokens += item.estimatedTokens;
      }
    }

    return {
      planId: plan.id,
      totalEstimatedTokens: plan.estimatedTokens,
      budget,
      remainingTokens: Math.max(0, budget - plan.estimatedTokens),
      selectedItemsCount: plan.items.length,
      omittedItemsCount: plan.omitted.length,
      tokenBreakdown: {
        system: systemTokens,
        toolSchemas: toolSchemasTokens,
        items: itemTokens,
        toolResults: toolResultsTokens,
      },
      selectedItems: plan.items.map((i) => ({
        id: i.id,
        sourceType: i.sourceType,
        priority: i.priority,
        tokens: i.estimatedTokens,
        because: i.selectedBecause,
        authority: i.authority,
      })),
      omittedItems: plan.omitted.map((o) => ({
        sourceId: o.sourceId,
        reason: o.reason,
        tokens: o.estimatedTokens,
      })),
      decisions: plan.decisions.map((d) => ({
        decisionType: d.decisionType,
        rationale: d.rationale,
        affectedItems: d.affectedItems,
      })),
    };
  }
}
