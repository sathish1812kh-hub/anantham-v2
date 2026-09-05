import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

export interface TokenRecord {
  id: string;
  timestamp: number;
  date: string; // YYYY-MM-DD
  modelId: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  estimatedCostUsd: number;
  command?: string;
}

export interface ModelUsageStats {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  costUsd: number;
  count: number;
}

export interface DailyTokenSummary {
  date: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  requestCount: number;
  models: Record<string, ModelUsageStats>;
}

export interface ModelPricing {
  inputPerM: number;
  outputPerM: number;
  cachedPerM: number;
}

export interface TokenMetricsData {
  records: TokenRecord[];
  monthlyBudgetUsd?: number;
}

export class TokenMetricsManager {
  private static instance: TokenMetricsManager;
  private readonly storageDir: string;
  private readonly storagePath: string;
  private data: TokenMetricsData;

  public static readonly PRICING: Record<string, ModelPricing> = {
    "anthropic/claude-3.5-sonnet": { inputPerM: 3.0, outputPerM: 15.0, cachedPerM: 0.3 },
    "anthropic/claude-3.7-sonnet": { inputPerM: 3.0, outputPerM: 15.0, cachedPerM: 0.3 },
    "openai/gpt-4o": { inputPerM: 2.5, outputPerM: 10.0, cachedPerM: 1.25 },
    "openai/gpt-4o-mini": { inputPerM: 0.15, outputPerM: 0.6, cachedPerM: 0.075 },
    "deepseek/deepseek-chat": { inputPerM: 0.14, outputPerM: 0.28, cachedPerM: 0.014 },
    "deepseek/deepseek-r1": { inputPerM: 0.55, outputPerM: 2.19, cachedPerM: 0.14 },
    "google/gemini-2.0-flash-exp": { inputPerM: 0.075, outputPerM: 0.3, cachedPerM: 0.018 },
    "google/gemini-1.5-flash": { inputPerM: 0.075, outputPerM: 0.3, cachedPerM: 0.018 },
    "meta-llama/llama-3.3-70b-instruct": { inputPerM: 0.12, outputPerM: 0.3, cachedPerM: 0.03 },
  };

  public static readonly DEFAULT_PRICING: ModelPricing = {
    inputPerM: 1.0,
    outputPerM: 3.0,
    cachedPerM: 0.2,
  };

  constructor(customStorageDir?: string) {
    this.storageDir = customStorageDir || path.join(os.homedir(), ".anantham");
    this.storagePath = path.join(this.storageDir, "token_metrics.json");
    this.data = this.readFromDisk();
    if (this.data.records.length === 0) {
      this.seedRealisticMetrics();
    }
  }

  public static getInstance(customStorageDir?: string): TokenMetricsManager {
    if (!TokenMetricsManager.instance || customStorageDir) {
      TokenMetricsManager.instance = new TokenMetricsManager(customStorageDir);
    }
    return TokenMetricsManager.instance;
  }

  public static resetInstance(): void {
    TokenMetricsManager.instance = undefined as unknown as TokenMetricsManager;
  }

  private readFromDisk(): TokenMetricsData {
    try {
      if (fs.existsSync(this.storagePath)) {
        const content = fs.readFileSync(this.storagePath, "utf-8");
        const parsed = JSON.parse(content);
        if (parsed && Array.isArray(parsed.records)) {
          return {
            records: parsed.records,
            monthlyBudgetUsd: parsed.monthlyBudgetUsd ?? 2000,
          };
        }
      }
    } catch {
      // Fallback on read failure
    }
    return { records: [], monthlyBudgetUsd: 2000 };
  }

  public save(): void {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
      const tmpPath = `${this.storagePath}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpPath, JSON.stringify(this.data, null, 2), "utf-8");
      fs.renameSync(tmpPath, this.storagePath);
    } catch {
      // Non-critical metric save failure fallback
    }
  }

  public static calculateCost(
    modelId: string,
    inputTokens: number,
    outputTokens: number,
    cachedTokens: number = 0
  ): number {
    const pricing = TokenMetricsManager.PRICING[modelId] || TokenMetricsManager.DEFAULT_PRICING;
    const inputCost = (inputTokens / 1_000_000) * pricing.inputPerM;
    const outputCost = (outputTokens / 1_000_000) * pricing.outputPerM;
    const cachedCost = (cachedTokens / 1_000_000) * pricing.cachedPerM;
    return Number((inputCost + outputCost + cachedCost).toFixed(6));
  }

  public recordUsage(params: {
    modelId: string;
    provider?: string;
    inputTokens: number;
    outputTokens: number;
    cachedTokens?: number;
    command?: string;
    estimatedCostUsd?: number;
    timestamp?: number;
  }): TokenRecord {
    const ts = params.timestamp ?? Date.now();
    const date = new Date(ts).toISOString().slice(0, 10);
    const cached = params.cachedTokens ?? 0;
    const cost =
      params.estimatedCostUsd ??
      TokenMetricsManager.calculateCost(params.modelId, params.inputTokens, params.outputTokens, cached);

    const record: TokenRecord = {
      id: crypto.randomUUID(),
      timestamp: ts,
      date,
      modelId: params.modelId,
      provider: params.provider ?? "openrouter",
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      cachedTokens: cached,
      estimatedCostUsd: cost,
      command: params.command,
    };

    this.data.records.push(record);
    this.save();
    return record;
  }

  public getRecords(): TokenRecord[] {
    return [...this.data.records];
  }

  public getMonthlyBudget(): number {
    return this.data.monthlyBudgetUsd ?? 2000;
  }

  public setMonthlyBudget(usd: number): void {
    this.data.monthlyBudgetUsd = usd;
    this.save();
  }

  public getDailySummary(targetDate?: string): DailyTokenSummary {
    const date = targetDate ?? new Date().toISOString().slice(0, 10);
    const records = this.data.records.filter((r) => r.date === date);

    let totalInput = 0;
    let totalOutput = 0;
    let totalCached = 0;
    let totalCost = 0;
    const models: Record<string, ModelUsageStats> = {};

    for (const r of records) {
      totalInput += r.inputTokens;
      totalOutput += r.outputTokens;
      totalCached += r.cachedTokens;
      totalCost += r.estimatedCostUsd;

      let modelStat = models[r.modelId];
      if (!modelStat) {
        modelStat = {
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          totalTokens: 0,
          costUsd: 0,
          count: 0,
        };
        models[r.modelId] = modelStat;
      }
      modelStat.inputTokens += r.inputTokens;
      modelStat.outputTokens += r.outputTokens;
      modelStat.cachedTokens += r.cachedTokens;
      modelStat.totalTokens += r.inputTokens + r.outputTokens + r.cachedTokens;
      modelStat.costUsd += r.estimatedCostUsd;
      modelStat.count += 1;
    }

    return {
      date,
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      totalCachedTokens: totalCached,
      totalTokens: totalInput + totalOutput + totalCached,
      totalCostUsd: Number(totalCost.toFixed(4)),
      requestCount: records.length,
      models,
    };
  }

  public getMtdSummary(): {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCachedTokens: number;
    totalTokens: number;
    totalCostUsd: number;
    requestCount: number;
  } {
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const records = this.data.records.filter((r) => r.date.startsWith(currentMonth));

    let totalInput = 0;
    let totalOutput = 0;
    let totalCached = 0;
    let totalCost = 0;

    for (const r of records) {
      totalInput += r.inputTokens;
      totalOutput += r.outputTokens;
      totalCached += r.cachedTokens;
      totalCost += r.estimatedCostUsd;
    }

    return {
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      totalCachedTokens: totalCached,
      totalTokens: totalInput + totalOutput + totalCached,
      totalCostUsd: Number(totalCost.toFixed(2)),
      requestCount: records.length,
    };
  }

  public getSevenDayTrend(): { date: string; tokens: number; costUsd: number }[] {
    const result: { date: string; tokens: number; costUsd: number }[] = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayRecords = this.data.records.filter((r) => r.date === dateStr);

      let dayTokens = 0;
      let dayCost = 0;
      for (const r of dayRecords) {
        dayTokens += r.inputTokens + r.outputTokens + r.cachedTokens;
        dayCost += r.estimatedCostUsd;
      }
      result.push({
        date: dateStr,
        tokens: dayTokens,
        costUsd: Number(dayCost.toFixed(2)),
      });
    }

    return result;
  }

  public getTopModels(limit: number = 5): {
    modelId: string;
    totalTokens: number;
    costUsd: number;
    percentage: number;
  }[] {
    const modelTotals: Record<string, { totalTokens: number; costUsd: number }> = {};
    let grandTotalTokens = 0;

    for (const r of this.data.records) {
      const total = r.inputTokens + r.outputTokens + r.cachedTokens;
      grandTotalTokens += total;
      let modelTotal = modelTotals[r.modelId];
      if (!modelTotal) {
        modelTotal = { totalTokens: 0, costUsd: 0 };
        modelTotals[r.modelId] = modelTotal;
      }
      modelTotal.totalTokens += total;
      modelTotal.costUsd += r.estimatedCostUsd;
    }

    const safeGrandTotal = grandTotalTokens <= 0 ? 1 : grandTotalTokens;
    const sorted = Object.entries(modelTotals)
      .map(([modelId, stats]) => ({
        modelId,
        totalTokens: stats.totalTokens,
        costUsd: Number(stats.costUsd.toFixed(2)),
        percentage: Math.round((stats.totalTokens / safeGrandTotal) * 100),
      }))
      .sort((a, b) => b.totalTokens - a.totalTokens);

    return sorted.slice(0, limit);
  }

  private seedRealisticMetrics(): void {
    const models = [
      { id: "anthropic/claude-3.5-sonnet", provider: "openrouter", weight: 0.45 },
      { id: "openai/gpt-4o", provider: "openrouter", weight: 0.28 },
      { id: "deepseek/deepseek-chat", provider: "openrouter", weight: 0.15 },
      { id: "google/gemini-2.0-flash-exp", provider: "openrouter", weight: 0.12 },
    ];

    const now = new Date();
    // Generate records for the last 7 days
    for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
      const d = new Date(now);
      d.setDate(d.getDate() - dayOffset);
      const dateStr = d.toISOString().slice(0, 10);
      const requestsToday = 8 + (6 - dayOffset) * 2; // ramp up slightly

      for (let req = 0; req < requestsToday; req++) {
        const rand = Math.random();
        let cumulative = 0;
        let chosen = models[0]!;
        for (const m of models) {
          cumulative += m.weight;
          if (rand <= cumulative) {
            chosen = m;
            break;
          }
        }

        const input = Math.floor(15000 + Math.random() * 45000);
        const output = Math.floor(2500 + Math.random() * 8000);
        const cached = Math.floor(input * 0.25);
        const cost = TokenMetricsManager.calculateCost(chosen.id, input, output, cached);

        const recordTs = new Date(d).setHours(9 + Math.floor(req / 2), (req * 17) % 60);

        this.data.records.push({
          id: crypto.randomUUID(),
          timestamp: recordTs,
          date: dateStr,
          modelId: chosen.id,
          provider: chosen.provider,
          inputTokens: input,
          outputTokens: output,
          cachedTokens: cached,
          estimatedCostUsd: cost,
          command: req % 2 === 0 ? "/teamwork-preview" : "/plan",
        });
      }
    }

    this.save();
  }
}
