import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TokenMetricsManager } from "../../src/persistence/token-metrics-manager.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("TokenMetricsManager — Authoritative Token Analytics & Cost Attribution", () => {
  let tempDir: string;
  let manager: TokenMetricsManager;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `token-metrics-test-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    TokenMetricsManager.resetInstance();
    manager = new TokenMetricsManager(tempDir);
  });

  afterEach(() => {
    TokenMetricsManager.resetInstance();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("calculates model pricing accurately across providers", () => {
    // Claude 3.5 Sonnet: $3 / 1M in, $15 / 1M out
    const costClaude = TokenMetricsManager.calculateCost("anthropic/claude-3.5-sonnet", 1_000_000, 1_000_000);
    expect(costClaude).toBe(18.0);

    // DeepSeek V3: $0.14 / 1M in, $0.28 / 1M out
    const costDeepSeek = TokenMetricsManager.calculateCost("deepseek/deepseek-chat", 1_000_000, 1_000_000);
    expect(costDeepSeek).toBe(0.42);
  });

  it("records usage and aggregates daily summaries", () => {
    const record = manager.recordUsage({
      modelId: "anthropic/claude-3.5-sonnet",
      inputTokens: 10000,
      outputTokens: 2000,
      cachedTokens: 2500,
      command: "/teamwork-preview",
    });

    expect(record.id).toBeDefined();
    expect(record.inputTokens).toBe(10000);
    expect(record.outputTokens).toBe(2000);
    expect(record.cachedTokens).toBe(2500);
    expect(record.estimatedCostUsd).toBeGreaterThan(0);

    const summary = manager.getDailySummary(record.date);
    expect(summary.totalInputTokens).toBeGreaterThanOrEqual(10000);
    expect(summary.totalOutputTokens).toBeGreaterThanOrEqual(2000);
    expect(summary.totalCostUsd).toBeGreaterThan(0);
  });

  it("computes MTD summary, 7-day trend, and top models leaderboard", () => {
    const mtd = manager.getMtdSummary();
    expect(mtd.totalTokens).toBeGreaterThan(0);
    expect(mtd.totalCostUsd).toBeGreaterThan(0);

    const trend = manager.getSevenDayTrend();
    expect(trend.length).toBe(7);
    expect(trend[0]!.date).toBeDefined();

    const top = manager.getTopModels(3);
    expect(top.length).toBeGreaterThan(0);
    expect(top[0]!.totalTokens).toBeGreaterThan(0);
    expect(top[0]!.percentage).toBeGreaterThan(0);
  });
});
