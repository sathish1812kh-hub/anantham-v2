import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { UserConfigManager } from "../../src/persistence/user-config-manager.js";
import { ModelCatalogCache, CachedModel } from "../../src/persistence/model-catalog-cache.js";
import { TokenMetricsManager } from "../../src/persistence/token-metrics-manager.js";
import { ModelCatalogCache as TuiModelCatalogCache } from "../../src/tui/model-catalog-cache.js";
import { TokenUsageTracker, TokenMetricsManager as TuiTokenMetricsManager } from "../../src/tui/token-usage-tracker.js";

describe("Dual-Path Configuration & Persistence Hierarchy", () => {
  let primaryDir: string;
  let fallbackDir: string;

  beforeEach(() => {
    UserConfigManager.resetInstance();
    ModelCatalogCache.resetInstance();
    TokenMetricsManager.resetInstance();

    primaryDir = path.join(os.tmpdir(), `anantham-primary-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    fallbackDir = path.join(os.tmpdir(), `anantham-fallback-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    fs.mkdirSync(primaryDir, { recursive: true });
    fs.mkdirSync(fallbackDir, { recursive: true });
  });

  afterEach(() => {
    UserConfigManager.resetInstance();
    ModelCatalogCache.resetInstance();
    TokenMetricsManager.resetInstance();

    try {
      fs.rmSync(primaryDir, { recursive: true, force: true });
      fs.rmSync(fallbackDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  describe("UserConfigManager Dual Path", () => {
    it("reads configuration from primary path (~/.antigravity/config.json) when present", () => {
      const primaryConfigFile = path.join(primaryDir, "config.json");
      fs.writeFileSync(
        primaryConfigFile,
        JSON.stringify({
          apiKeys: { openrouter: "sk-or-primary-key" },
          defaultModel: "openrouter/anthropic/claude-3.5-sonnet",
        }),
        "utf-8"
      );

      const manager = new UserConfigManager(primaryDir, fallbackDir);
      expect(manager.getApiKey("openrouter")).toBe("sk-or-primary-key");
      expect(manager.getDefaultModel()).toBe("openrouter/anthropic/claude-3.5-sonnet");
    });

    it("falls back to ~/.anantham/config.json when primary config is absent", () => {
      const fallbackConfigFile = path.join(fallbackDir, "config.json");
      fs.writeFileSync(
        fallbackConfigFile,
        JSON.stringify({
          apiKeys: { openai: "sk-legacy-key" },
          defaultModel: "openai/gpt-4o",
        }),
        "utf-8"
      );

      // Primary directory is empty
      const manager = new UserConfigManager(primaryDir, fallbackDir);
      expect(manager.getApiKey("openai")).toBe("sk-legacy-key");
      expect(manager.getDefaultModel()).toBe("openai/gpt-4o");
    });

    it("migrates fallback data to primary config upon save() without mutating fallback file", () => {
      const fallbackConfigFile = path.join(fallbackDir, "config.json");
      fs.writeFileSync(
        fallbackConfigFile,
        JSON.stringify({
          apiKeys: { anthropic: "sk-legacy-anthropic" },
        }),
        "utf-8"
      );

      const manager = new UserConfigManager(primaryDir, fallbackDir);
      manager.setApiKey("openrouter", "sk-new-openrouter");

      // Verify primary config file is written
      const primaryConfigFile = path.join(primaryDir, "config.json");
      expect(fs.existsSync(primaryConfigFile)).toBe(true);

      const primaryData = JSON.parse(fs.readFileSync(primaryConfigFile, "utf-8"));
      expect(primaryData.apiKeys.anthropic).toBe("sk-legacy-anthropic");
      expect(primaryData.apiKeys.openrouter).toBe("sk-new-openrouter");

      // Verify fallback file was not altered with the new key
      const fallbackData = JSON.parse(fs.readFileSync(fallbackConfigFile, "utf-8"));
      expect(fallbackData.apiKeys.openrouter).toBeUndefined();
    });

    it("stores and retrieves key metadata in UserConfig", () => {
      const manager = new UserConfigManager(primaryDir, fallbackDir);
      manager.setApiKey("openrouter", "sk-or-meta-key");
      manager.setKeyMetadata("openrouter", {
        label: "Production Key",
        limit: 100,
        usage: 12.5,
        is_free_tier: false,
      });

      const meta = manager.getKeyMetadata("openrouter");
      expect(meta).toBeDefined();
      expect(meta?.label).toBe("Production Key");
      expect(meta?.limit).toBe(100);
      expect(meta?.usage).toBe(12.5);
      expect(meta?.is_free_tier).toBe(false);
      expect(meta?.validatedAt).toBeDefined();

      const listed = manager.listKeys();
      const orKey = listed.find((k) => k.provider === "openrouter");
      expect(orKey?.configured).toBe(true);
      expect(orKey?.metadata?.label).toBe("Production Key");
    });

    it("validateAndSetApiKey persists credentials only when handshake succeeds", async () => {
      const manager = new UserConfigManager(primaryDir, fallbackDir);

      const mockFetchValid = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            label: "Verified Key",
            limit: 200,
            usage: 5.25,
            is_free_tier: false,
          },
        }),
      } as unknown as Response);

      const resValid = await manager.validateAndSetApiKey("openrouter", "sk-or-valid-test", undefined, {
        fetchFn: mockFetchValid as unknown as typeof fetch,
      });

      expect(resValid.valid).toBe(true);
      expect(manager.getApiKey("openrouter")).toBe("sk-or-valid-test");
      expect(manager.getKeyMetadata("openrouter")?.label).toBe("Verified Key");

      // Test invalid key
      const mockFetchInvalid = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      } as unknown as Response);

      const resInvalid = await manager.validateAndSetApiKey("openrouter", "sk-or-invalid-test", undefined, {
        fetchFn: mockFetchInvalid as unknown as typeof fetch,
      });

      expect(resInvalid.valid).toBe(false);
      // Key must not have overwritten previous valid key
      expect(manager.getApiKey("openrouter")).toBe("sk-or-valid-test");
    });
  });

  describe("ModelCatalogCache Dual Path", () => {
    const sampleModels: CachedModel[] = [
      {
        id: "anthropic/claude-3.5-sonnet",
        name: "Claude 3.5 Sonnet",
        provider: "anthropic",
        contextLength: 200_000,
        promptPricePerM: 3.0,
        completionPricePerM: 15.0,
      },
    ];

    it("reads cached models from primary ~/.antigravity/models_cache.json", () => {
      const primaryFile = path.join(primaryDir, "models_cache.json");
      fs.writeFileSync(
        primaryFile,
        JSON.stringify({
          fetchedAt: Date.now(),
          ttlMs: 3600000,
          models: sampleModels,
        }),
        "utf-8"
      );

      const cache = new ModelCatalogCache(primaryDir, 3600000, fallbackDir);
      const models = cache.getCachedModels();
      expect(models).toHaveLength(1);
      expect(models![0].id).toBe("anthropic/claude-3.5-sonnet");
    });

    it("falls back to ~/.anantham/models_cache.json when primary cache is absent", () => {
      const fallbackFile = path.join(fallbackDir, "models_cache.json");
      fs.writeFileSync(
        fallbackFile,
        JSON.stringify({
          fetchedAt: Date.now(),
          ttlMs: 3600000,
          models: sampleModels,
        }),
        "utf-8"
      );

      const cache = new ModelCatalogCache(primaryDir, 3600000, fallbackDir);
      const models = cache.getCachedModels();
      expect(models).toHaveLength(1);
      expect(models![0].id).toBe("anthropic/claude-3.5-sonnet");
    });

    it("writes cached models to primary cache location", () => {
      const cache = new ModelCatalogCache(primaryDir, 3600000, fallbackDir);
      cache.saveModels(sampleModels);

      const primaryFile = path.join(primaryDir, "models_cache.json");
      expect(fs.existsSync(primaryFile)).toBe(true);

      const saved = JSON.parse(fs.readFileSync(primaryFile, "utf-8"));
      expect(saved.models).toHaveLength(1);
      expect(saved.models[0].id).toBe("anthropic/claude-3.5-sonnet");
    });

    it("TUI facade re-export exposes ModelCatalogCache identical constructor", () => {
      expect(TuiModelCatalogCache).toBe(ModelCatalogCache);
    });
  });

  describe("TokenMetricsManager Dual Path & Test Compatibility", () => {
    it("reads telemetry from primary ~/.antigravity/usage_metrics.json", () => {
      const primaryMetrics = path.join(primaryDir, "usage_metrics.json");
      fs.writeFileSync(
        primaryMetrics,
        JSON.stringify({
          records: [
            {
              id: "rec-1",
              timestamp: Date.now(),
              date: "2026-09-06",
              modelId: "openai/gpt-4o",
              provider: "openai",
              inputTokens: 1000,
              outputTokens: 500,
              cachedTokens: 0,
              estimatedCostUsd: 0.005,
            },
          ],
          monthlyBudgetUsd: 2000,
        }),
        "utf-8"
      );

      const manager = new TokenMetricsManager(primaryDir, fallbackDir);
      const records = manager.getRecords();
      expect(records).toHaveLength(1);
      expect(records[0].modelId).toBe("openai/gpt-4o");
      const summary = manager.getDailySummary("2026-09-06");
      expect(summary.totalTokens).toBe(1500);
      expect(summary.totalCostUsd).toBe(0.005);
    });

    it("falls back to ~/.anantham/token_metrics.json when primary is absent", () => {
      const fallbackMetrics = path.join(fallbackDir, "token_metrics.json");
      fs.writeFileSync(
        fallbackMetrics,
        JSON.stringify({
          records: [
            {
              id: "rec-legacy",
              timestamp: Date.now(),
              date: "2026-09-06",
              modelId: "anthropic/claude-3.5-sonnet",
              provider: "anthropic",
              inputTokens: 2000,
              outputTokens: 1000,
              cachedTokens: 0,
              estimatedCostUsd: 0.021,
            },
          ],
          monthlyBudgetUsd: 1500,
        }),
        "utf-8"
      );

      const manager = new TokenMetricsManager(primaryDir, fallbackDir);
      const records = manager.getRecords();
      expect(records).toHaveLength(1);
      expect(records[0].modelId).toBe("anthropic/claude-3.5-sonnet");
      expect(manager.getMonthlyBudget()).toBe(1500);
      const summary = manager.getDailySummary("2026-09-06");
      expect(summary.totalTokens).toBe(3000);
    });

    it("mirrors to token_metrics.json when customStorageDir is provided for backward compatibility", () => {
      const manager = new TokenMetricsManager(primaryDir);
      manager.recordUsage({
        modelId: "google/gemini-2.0-flash-exp",
        inputTokens: 5000,
        outputTokens: 2500,
      });

      const primaryFile = path.join(primaryDir, "usage_metrics.json");
      const legacyFile = path.join(primaryDir, "token_metrics.json");

      expect(fs.existsSync(primaryFile)).toBe(true);
      expect(fs.existsSync(legacyFile)).toBe(true);

      const legacyContent = JSON.parse(fs.readFileSync(legacyFile, "utf-8"));
      expect(legacyContent.records.some((r: any) => r.modelId === "google/gemini-2.0-flash-exp")).toBe(true);
    });

    it("TUI facade re-export exposes TokenUsageTracker / TokenMetricsManager", () => {
      expect(TuiTokenMetricsManager).toBe(TokenMetricsManager);
      expect(TokenUsageTracker).toBe(TokenMetricsManager);
    });
  });
});
