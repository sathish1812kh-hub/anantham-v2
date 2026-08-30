import { describe, it, expect } from "vitest";
import { ContextEngine } from "../../src/context/context-engine.js";

describe("ContextEngine - Relevance and Priority Selection", () => {
  it("prioritizes CRITICAL over NORMAL/LOW and prunes low-priority items on budget limits", async () => {
    const plan = await ContextEngine.assembleContext({
      sessionId: "ses_01",
      projectId: "prj_01",
      maxTotalTokens: 50, // Strict small budget
      modelProfile: {
        modelId: "gpt-4o",
        supportedModalities: ["text"],
      },
      candidates: [
        {
          id: "low_item",
          sourceType: "memory",
          sourceId: "mem_historical",
          rawContent: "Old historical logs that take up significant tokens in memory...",
          priority: "LOW",
          authority: "repository-content",
          selectedBecause: "Historical memory lookup",
        },
        {
          id: "critical_item",
          sourceType: "task",
          sourceId: "task_active",
          rawContent: "Active goal: RPO 0 durability.",
          priority: "CRITICAL",
          authority: "project-instruction",
          selectedBecause: "Active task invariant",
        },
        {
          id: "drop_item",
          sourceType: "history",
          sourceId: "hist_dropped",
          rawContent: "Irrelevant dropped message",
          priority: "DROP",
          authority: "untrusted",
          selectedBecause: "Excluded message",
        },
      ],
    });

    const selectedSourceIds = plan.items.map((i) => i.sourceId);
    expect(selectedSourceIds).toContain("task_active");
    expect(selectedSourceIds).not.toContain("hist_dropped");

    const omittedSourceIds = plan.omitted.map((o) => o.sourceId);
    expect(omittedSourceIds).toContain("hist_dropped");
  });
});
