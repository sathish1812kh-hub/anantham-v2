import { describe, it, expect } from "vitest";
import { TokenCostAccountingEngine } from "../../src/observability/token-cost-accounting.js";

describe("PRD-OBS-002: Token & Cost Accounting Engine", () => {
  const engine = new TokenCostAccountingEngine();

  it("calculates cost accurately based on model pricing table", () => {
    // 1M input = $1.25, 1M output = $5.0 for gemini-2.5-pro
    // 100,000 input = $0.125, 50,000 output = $0.25 => total = $0.375
    const cost = engine.calculateCost("gemini-2.5-pro", 100_000, 50_000);
    expect(cost).toBe(0.375);
  });

  it("accumulates session usage and triggers budget limits", () => {
    engine.setSessionBudget("sess_budget", 0.5); // $0.50 budget

    const res1 = engine.recordUsage("sess_budget", "gemini-2.5-pro", 50_000, 25_000);
    expect(res1.budgetExceeded).toBe(false);
    expect(res1.remainingBudgetUsd).toBeGreaterThan(0);

    // Large usage exceeding budget
    const res2 = engine.recordUsage("sess_budget", "gemini-2.5-pro", 200_000, 100_000);
    expect(res2.budgetExceeded).toBe(true);
    expect(res2.remainingBudgetUsd).toBe(0);
  });
});
