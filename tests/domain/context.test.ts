import { describe, it, expect } from "vitest";
import {
  ContextPlanSchema,
  ContextPrioritySchema,
  type ContextPlan,
} from "../../src/domain/context.js";

describe("ContextPlan Domain Contracts", () => {
  it("validates an assembled ContextPlan with token budgets and decision audit", () => {
    const plan: ContextPlan = {
      id: "ctx_plan_001",
      items: [
        {
          id: "item_01",
          sourceType: "task",
          sourceId: "task_01",
          representationType: "text",
          priority: "CRITICAL",
          estimatedTokens: 250,
          selectedBecause: "Active task objective and acceptance criteria",
          authority: "system",
          content: "Objective: Implement P1.1 Core Domain Models",
        },
        {
          id: "item_02",
          sourceType: "memory",
          sourceId: "mem_001",
          representationType: "text",
          priority: "HIGH",
          estimatedTokens: 80,
          selectedBecause: "Critical architecture persistence decision",
          authority: "developer",
          content: "SQLite WAL mode required.",
        },
      ],
      estimatedTokens: 330,
      modalityUsage: {
        text: 330,
        image: 0,
      },
      omitted: [
        {
          sourceId: "log_history_01",
          reason: "Prior verbose build logs pruned",
          estimatedTokens: 1200,
        },
      ],
      decisions: [
        {
          decisionType: "include",
          rationale: "Selected critical task objective and architecture memory",
          affectedItems: ["item_01", "item_02"],
        },
        {
          decisionType: "prune-tool-result",
          rationale: "Pruned old build log into artifact reference",
          affectedItems: ["log_history_01"],
        },
      ],
      checkpointSource: "chk_001",
      createdAt: "2026-08-30T20:00:00.000Z",
    };

    const parsed = ContextPlanSchema.parse(plan);
    expect(parsed).toEqual(plan);
  });

  it("validates all context priorities", () => {
    const priorities = ["CRITICAL", "HIGH", "NORMAL", "LOW", "DROP"];
    for (const p of priorities) {
      expect(ContextPrioritySchema.parse(p)).toBe(p);
    }
  });
});
