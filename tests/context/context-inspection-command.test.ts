import { describe, it, expect } from "vitest";
import { ContextEngine } from "../../src/context/context-engine.js";

describe("ContextEngine - /context Operational Inspection", () => {
  it("generates structured explainability report for /context command", async () => {
    const plan = await ContextEngine.assembleContext({
      sessionId: "ses_01",
      projectId: "prj_01",
      systemPrompt: "System rules",
      modelProfile: {
        modelId: "gpt-4o",
        supportedModalities: ["text"],
      },
      candidates: [
        {
          id: "cand_1",
          sourceType: "task",
          sourceId: "task_1",
          rawContent: "Task content",
          priority: "HIGH",
          authority: "project-instruction",
          selectedBecause: "Active task",
        },
      ],
    });

    const report = ContextEngine.inspectContext(plan, 128000);

    expect(report.planId).toBe(plan.id);
    expect(report.budget).toBe(128000);
    expect(report.selectedItemsCount).toBe(2);
    expect(report.tokenBreakdown.system).toBeGreaterThan(0);
    expect(report.tokenBreakdown.items).toBeGreaterThan(0);
    expect(report.selectedItems.some((i) => i.id === "cand_1")).toBe(true);
  });
});
