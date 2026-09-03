import { describe, it, expect } from "vitest";
import { AbTestingEngine } from "../../src/evaluation/ab-testing-engine.js";

describe("PRD-PART2-317: A/B Testing Engine for Prompt Variants & Agent Configurations", () => {
  it("splits traffic between variants according to weight and computes conversion metrics", () => {
    const engine = new AbTestingEngine([
      { id: "v_concise", name: "Concise System Prompt", weight: 0.5, promptTemplate: "Be concise.", config: {} },
      { id: "v_detailed", name: "Detailed System Prompt", weight: 0.5, promptTemplate: "Be thorough.", config: {} },
    ]);

    // Route seed 0.2 => v_concise
    const routed1 = engine.routeRequest(0.2);
    expect(routed1.id).toBe("v_concise");

    // Route seed 0.8 => v_detailed
    const routed2 = engine.routeRequest(0.8);
    expect(routed2.id).toBe("v_detailed");

    // Record outcomes
    engine.recordOutcome("v_concise", true);
    engine.recordOutcome("v_concise", true);
    engine.recordOutcome("v_concise", false); // 2/3 = 0.6667

    engine.recordOutcome("v_detailed", true);
    engine.recordOutcome("v_detailed", false); // 1/2 = 0.5

    const mConcise = engine.getVariantMetrics("v_concise");
    expect(mConcise?.successRate).toBe(0.6667);

    const mDetailed = engine.getVariantMetrics("v_detailed");
    expect(mDetailed?.successRate).toBe(0.5);
  });
});
