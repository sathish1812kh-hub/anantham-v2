/**
 * Token & Cost Accounting Engine
 * PRD-OBS-002: Token & Cost Accounting Engine
 */

export interface ModelPricing {
  modelId: string;
  inputCostPer1M: number;
  outputCostPer1M: number;
  cacheReadCostPer1M?: number;
}

export interface SessionUsageRecord {
  sessionId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
}

export class TokenCostAccountingEngine {
  private pricingTable: Map<string, ModelPricing> = new Map();
  private sessionUsage: Map<string, SessionUsageRecord> = new Map();
  private sessionBudgets: Map<string, number> = new Map();

  constructor() {
    this.registerDefaultPricing();
  }

  public registerPricing(pricing: ModelPricing): void {
    this.pricingTable.set(pricing.modelId.toLowerCase(), pricing);
  }

  public setSessionBudget(sessionId: string, maxCostUsd: number): void {
    this.sessionBudgets.set(sessionId, maxCostUsd);
  }

  public calculateCost(
    modelId: string,
    inputTokens: number,
    outputTokens: number,
    cacheReadTokens = 0
  ): number {
    const pricing =
      this.pricingTable.get(modelId.toLowerCase()) ??
      this.pricingTable.get("default")!;

    const inputCost = (inputTokens / 1_000_000) * pricing.inputCostPer1M;
    const outputCost = (outputTokens / 1_000_000) * pricing.outputCostPer1M;
    const cacheCost = ((cacheReadTokens / 1_000_000) * (pricing.cacheReadCostPer1M ?? 0));

    return Number((inputCost + outputCost + cacheCost).toFixed(6));
  }

  public recordUsage(
    sessionId: string,
    modelId: string,
    inputTokens: number,
    outputTokens: number,
    cacheReadTokens = 0
  ): { currentUsage: SessionUsageRecord; budgetExceeded: boolean; remainingBudgetUsd?: number } {
    const cost = this.calculateCost(modelId, inputTokens, outputTokens, cacheReadTokens);
    const existing = this.sessionUsage.get(sessionId) ?? {
      sessionId,
      modelId,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      costUsd: 0,
    };

    existing.inputTokens += inputTokens;
    existing.outputTokens += outputTokens;
    existing.cacheReadTokens += cacheReadTokens;
    existing.costUsd = Number((existing.costUsd + cost).toFixed(6));
    this.sessionUsage.set(sessionId, existing);

    const budget = this.sessionBudgets.get(sessionId);
    const budgetExceeded = budget !== undefined && existing.costUsd > budget;
    const remainingBudgetUsd = budget !== undefined ? Math.max(0, budget - existing.costUsd) : undefined;

    return {
      currentUsage: existing,
      budgetExceeded,
      remainingBudgetUsd,
    };
  }

  public getSessionUsage(sessionId: string): SessionUsageRecord | undefined {
    return this.sessionUsage.get(sessionId);
  }

  private registerDefaultPricing(): void {
    this.registerPricing({
      modelId: "default",
      inputCostPer1M: 1.0,
      outputCostPer1M: 3.0,
      cacheReadCostPer1M: 0.25,
    });
    this.registerPricing({
      modelId: "gemini-2.5-pro",
      inputCostPer1M: 1.25,
      outputCostPer1M: 5.0,
      cacheReadCostPer1M: 0.3,
    });
    this.registerPricing({
      modelId: "gemini-2.5-flash",
      inputCostPer1M: 0.075,
      outputCostPer1M: 0.3,
      cacheReadCostPer1M: 0.02,
    });
  }
}
