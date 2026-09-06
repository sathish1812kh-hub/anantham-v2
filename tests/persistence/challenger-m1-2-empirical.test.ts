import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { UserConfigManager } from "../../src/persistence/user-config-manager.js";
import { ModelCatalogCache, CachedModel } from "../../src/persistence/model-catalog-cache.js";
import { TokenMetricsManager } from "../../src/persistence/token-metrics-manager.js";
import { ModelCatalogCache as TuiModelCatalogCache } from "../../src/tui/model-catalog-cache.js";
import { TokenUsageTracker, TokenMetricsManager as TuiTokenMetricsManager } from "../../src/tui/token-usage-tracker.js";

describe("Empirical Challenger 2: Dual Configuration Resolution, Migration & Isolation", () => {
  let primaryDir: string;
  let fallbackDir: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    UserConfigManager.resetInstance();
    ModelCatalogCache.resetInstance();
    TokenMetricsManager.resetInstance();

    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.GROQ_API_KEY;

    primaryDir = path.join(os.tmpdir(), `challenger2-primary-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fallbackDir = path.join(os.tmpdir(), `challenger2-fallback-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(primaryDir, { recursive: true });
    fs.mkdirSync(fallbackDir, { recursive: true });
  });

  afterEach(() => {
    UserConfigManager.resetInstance();
    ModelCatalogCache.resetInstance();
    TokenMetricsManager.resetInstance();

    process.env = { ...originalEnv };
    vi.restoreAllMocks();

    try {
      if (fs.existsSync(primaryDir)) {
        fs.rmSync(primaryDir, { recursive: true, force: true });
      }
      if (fs.existsSync(fallbackDir)) {
        fs.rmSync(fallbackDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup error
    }
  });

  // =========================================================================
  // 1. UserConfigManager Verification
  // =========================================================================
  describe("1. UserConfigManager Filesystem States", () => {
    it("State 1.1: Only primary exists -> reads primary and saves to primary", () => {
      const primaryFile = path.join(primaryDir, "config.json");
      fs.writeFileSync(
        primaryFile,
        JSON.stringify({
          apiKeys: { openrouter: "sk-or-primary-only" },
          defaultModel: "openrouter/anthropic/claude-3.5-sonnet",
        }),
        "utf-8"
      );

      const manager = new UserConfigManager(primaryDir, fallbackDir);
      expect(manager.getApiKey("openrouter")).toBe("sk-or-primary-only");
      expect(manager.getDefaultModel()).toBe("openrouter/anthropic/claude-3.5-sonnet");
      expect(manager.getApiKey("openai")).toBeUndefined();

      // Mutation
      manager.setApiKey("openai", "sk-openai-new");

      // Verify primary updated
      const primaryData = JSON.parse(fs.readFileSync(primaryFile, "utf-8"));
      expect(primaryData.apiKeys.openrouter).toBe("sk-or-primary-only");
      expect(primaryData.apiKeys.openai).toBe("sk-openai-new");

      // Verify fallback was never created
      const fallbackFile = path.join(fallbackDir, "config.json");
      expect(fs.existsSync(fallbackFile)).toBe(false);
    });

    it("State 1.2: Only fallback exists -> reads fallback and migrates to primary on save without mutating fallback", () => {
      const fallbackFile = path.join(fallbackDir, "config.json");
      fs.writeFileSync(
        fallbackFile,
        JSON.stringify({
          apiKeys: { anthropic: "sk-ant-legacy", openrouter: "sk-or-legacy" },
          defaultModel: "anthropic/claude-3-opus",
        }),
        "utf-8"
      );

      const manager = new UserConfigManager(primaryDir, fallbackDir);
      expect(manager.getApiKey("anthropic")).toBe("sk-ant-legacy");
      expect(manager.getApiKey("openrouter")).toBe("sk-or-legacy");
      expect(manager.getDefaultModel()).toBe("anthropic/claude-3-opus");

      // Save a new key
      manager.setApiKey("deepseek", "sk-deepseek-migrated");

      // Verify primary config created with migrated keys + new key
      const primaryFile = path.join(primaryDir, "config.json");
      expect(fs.existsSync(primaryFile)).toBe(true);
      const primaryData = JSON.parse(fs.readFileSync(primaryFile, "utf-8"));
      expect(primaryData.apiKeys.anthropic).toBe("sk-ant-legacy");
      expect(primaryData.apiKeys.openrouter).toBe("sk-or-legacy");
      expect(primaryData.apiKeys.deepseek).toBe("sk-deepseek-migrated");
      expect(primaryData.defaultModel).toBe("anthropic/claude-3-opus");

      // Verify fallback file was NOT mutated
      const fallbackData = JSON.parse(fs.readFileSync(fallbackFile, "utf-8"));
      expect(fallbackData.apiKeys.deepseek).toBeUndefined();
      expect(fallbackData.apiKeys.anthropic).toBe("sk-ant-legacy");
    });

    it("State 1.3: Both exist -> primary takes absolute precedence", () => {
      const primaryFile = path.join(primaryDir, "config.json");
      fs.writeFileSync(
        primaryFile,
        JSON.stringify({
          apiKeys: { openrouter: "sk-or-authoritative" },
          defaultModel: "openrouter/meta-llama/llama-3.3-70b-instruct",
        }),
        "utf-8"
      );

      const fallbackFile = path.join(fallbackDir, "config.json");
      fs.writeFileSync(
        fallbackFile,
        JSON.stringify({
          apiKeys: { openrouter: "sk-or-stale-fallback", groq: "sk-groq-fallback" },
          defaultModel: "groq/llama-3",
        }),
        "utf-8"
      );

      const manager = new UserConfigManager(primaryDir, fallbackDir);
      expect(manager.getApiKey("openrouter")).toBe("sk-or-authoritative");
      expect(manager.getDefaultModel()).toBe("openrouter/meta-llama/llama-3.3-70b-instruct");
      // Fallback keys are not merged once primary exists
      expect(manager.getApiKey("groq")).toBeUndefined();

      // Mutation writes to primary
      manager.setApiKey("openrouter", "sk-or-updated");
      const primaryData = JSON.parse(fs.readFileSync(primaryFile, "utf-8"));
      expect(primaryData.apiKeys.openrouter).toBe("sk-or-updated");

      // Fallback is untouched
      const fallbackData = JSON.parse(fs.readFileSync(fallbackFile, "utf-8"));
      expect(fallbackData.apiKeys.openrouter).toBe("sk-or-stale-fallback");
    });

    it("State 1.4: Neither exists -> initializes defaults and persists cleanly", () => {
      const manager = new UserConfigManager(primaryDir, fallbackDir);
      expect(manager.getApiKey("openrouter")).toBeUndefined();
      expect(manager.getDefaultModel()).toBe("gemini-2.5-pro");
      expect(manager.getCustomModels()).toEqual([]);

      manager.setDefaultModel("openai/gpt-4o");
      const primaryFile = path.join(primaryDir, "config.json");
      expect(fs.existsSync(primaryFile)).toBe(true);
      const saved = JSON.parse(fs.readFileSync(primaryFile, "utf-8"));
      expect(saved.defaultModel).toBe("openai/gpt-4o");

      const fallbackFile = path.join(fallbackDir, "config.json");
      expect(fs.existsSync(fallbackFile)).toBe(false);
    });

    it("State 1.5: Directory isolation without customFallbackDir", () => {
      const isolatedManager = new UserConfigManager(primaryDir);
      expect(isolatedManager.getConfigDir()).toBe(primaryDir);
      expect(isolatedManager.getFallbackConfigDir()).toBe(primaryDir);
      expect(isolatedManager.getFallbackConfigPath()).toBe(path.join(primaryDir, "config.json"));
    });

    it("State 1.6: Malformed primary recovers from fallback", () => {
      const primaryFile = path.join(primaryDir, "config.json");
      fs.writeFileSync(primaryFile, "{ INVALID JSON SYNTAX !!", "utf-8");

      const fallbackFile = path.join(fallbackDir, "config.json");
      fs.writeFileSync(
        fallbackFile,
        JSON.stringify({
          apiKeys: { openrouter: "sk-or-recovered-from-fallback" },
        }),
        "utf-8"
      );

      const manager = new UserConfigManager(primaryDir, fallbackDir);
      expect(manager.getApiKey("openrouter")).toBe("sk-or-recovered-from-fallback");

      // Saving overwrites corrupted primary file with valid JSON
      manager.setApiKey("openrouter", "sk-or-fixed");
      const primaryData = JSON.parse(fs.readFileSync(primaryFile, "utf-8"));
      expect(primaryData.apiKeys.openrouter).toBe("sk-or-fixed");
    });
  });

  // =========================================================================
  // 2. ModelCatalogCache Verification
  // =========================================================================
  describe("2. ModelCatalogCache Filesystem States", () => {
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

    const alternateModels: CachedModel[] = [
      {
        id: "openai/gpt-4o",
        name: "GPT-4o",
        provider: "openai",
        contextLength: 128_000,
        promptPricePerM: 2.5,
        completionPricePerM: 10.0,
      },
    ];

    it("State 2.1: Only primary exists -> reads primary and saves to primary", () => {
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
      expect(cache.getCachedModels()).toHaveLength(1);
      expect(cache.getCachedModels()![0].id).toBe("anthropic/claude-3.5-sonnet");
      expect(cache.isCacheFresh()).toBe(true);

      // Save update
      cache.saveModels(alternateModels);
      const updated = JSON.parse(fs.readFileSync(primaryFile, "utf-8"));
      expect(updated.models[0].id).toBe("openai/gpt-4o");

      const fallbackFile = path.join(fallbackDir, "models_cache.json");
      expect(fs.existsSync(fallbackFile)).toBe(false);
    });

    it("State 2.2: Only fallback exists -> reads fallback and saves to primary without mutating fallback", () => {
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
      expect(cache.getCachedModels()).toHaveLength(1);
      expect(cache.getCachedModels()![0].id).toBe("anthropic/claude-3.5-sonnet");

      // Save to cache
      cache.saveModels(alternateModels);

      // Verify primary created
      const primaryFile = path.join(primaryDir, "models_cache.json");
      expect(fs.existsSync(primaryFile)).toBe(true);
      const primaryData = JSON.parse(fs.readFileSync(primaryFile, "utf-8"));
      expect(primaryData.models[0].id).toBe("openai/gpt-4o");

      // Verify fallback is untouched
      const fallbackData = JSON.parse(fs.readFileSync(fallbackFile, "utf-8"));
      expect(fallbackData.models[0].id).toBe("anthropic/claude-3.5-sonnet");
    });

    it("State 2.3: Both exist -> primary takes absolute precedence", () => {
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

      const fallbackFile = path.join(fallbackDir, "models_cache.json");
      fs.writeFileSync(
        fallbackFile,
        JSON.stringify({
          fetchedAt: Date.now(),
          ttlMs: 3600000,
          models: alternateModels,
        }),
        "utf-8"
      );

      const cache = new ModelCatalogCache(primaryDir, 3600000, fallbackDir);
      expect(cache.getCachedModels()![0].id).toBe("anthropic/claude-3.5-sonnet");
    });

    it("State 2.4: Neither exists -> getCachedModels returns null, fallback to curated models", async () => {
      const cache = new ModelCatalogCache(primaryDir, 3600000, fallbackDir);
      expect(cache.getCachedModels()).toBeNull();
      expect(cache.isCacheFresh()).toBe(false);

      // Mock network failure to ensure fallback to curated models is tested deterministically
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network offline"));

      // getModels with mock failed network triggers curated fallback
      const models = await cache.getModels(true);
      expect(models.length).toBeGreaterThan(10);
      expect(models.some((m) => m.id === "anthropic/claude-3.5-sonnet")).toBe(true);

      // Primary file should now exist with curated models
      const primaryFile = path.join(primaryDir, "models_cache.json");
      expect(fs.existsSync(primaryFile)).toBe(true);
      const fallbackFile = path.join(fallbackDir, "models_cache.json");
      expect(fs.existsSync(fallbackFile)).toBe(false);
    });

    it("State 2.5: Directory isolation without customFallbackDir", () => {
      const isolatedCache = new ModelCatalogCache(primaryDir);
      expect(isolatedCache.getStorageDir()).toBe(primaryDir);
      expect(isolatedCache.getFallbackStoragePath()).toBe(path.join(primaryDir, "models_cache.json"));
    });

    it("State 2.6: ClearCache unlinks primary file only", () => {
      const primaryFile = path.join(primaryDir, "models_cache.json");
      fs.writeFileSync(primaryFile, JSON.stringify({ fetchedAt: Date.now(), models: sampleModels }), "utf-8");

      const fallbackFile = path.join(fallbackDir, "models_cache.json");
      fs.writeFileSync(fallbackFile, JSON.stringify({ fetchedAt: Date.now(), models: alternateModels }), "utf-8");

      const cache = new ModelCatalogCache(primaryDir, 3600000, fallbackDir);
      cache.clearCache();

      expect(fs.existsSync(primaryFile)).toBe(false);
      expect(fs.existsSync(fallbackFile)).toBe(true);
    });
  });

  // =========================================================================
  // 3. TokenMetricsManager Verification
  // =========================================================================
  describe("3. TokenMetricsManager Filesystem States & Mirroring", () => {
    it("State 3.1: Only primary exists -> reads primary usage_metrics.json and saves to primary", () => {
      const primaryMetrics = path.join(primaryDir, "usage_metrics.json");
      fs.writeFileSync(
        primaryMetrics,
        JSON.stringify({
          records: [
            {
              id: "rec-p1",
              timestamp: 1725600000000,
              date: "2026-09-06",
              modelId: "openai/gpt-4o",
              provider: "openai",
              inputTokens: 1000,
              outputTokens: 500,
              cachedTokens: 100,
              estimatedCostUsd: 0.007,
            },
          ],
          monthlyBudgetUsd: 3000,
        }),
        "utf-8"
      );

      const manager = new TokenMetricsManager(primaryDir, fallbackDir);
      expect(manager.getRecords()).toHaveLength(1);
      expect(manager.getRecords()[0].id).toBe("rec-p1");
      expect(manager.getMonthlyBudget()).toBe(3000);

      // Record new usage
      manager.recordUsage({
        modelId: "deepseek/deepseek-r1",
        inputTokens: 2000,
        outputTokens: 1000,
      });

      expect(manager.getRecords()).toHaveLength(2);
      const primaryData = JSON.parse(fs.readFileSync(primaryMetrics, "utf-8"));
      expect(primaryData.records).toHaveLength(2);
      expect(primaryData.records[1].modelId).toBe("deepseek/deepseek-r1");

      const fallbackMetrics = path.join(fallbackDir, "token_metrics.json");
      expect(fs.existsSync(fallbackMetrics)).toBe(false);
    });

    it("State 3.2: Only fallback exists -> reads fallback token_metrics.json and migrates to primary on save without mutating fallback", () => {
      const fallbackMetrics = path.join(fallbackDir, "token_metrics.json");
      fs.writeFileSync(
        fallbackMetrics,
        JSON.stringify({
          records: [
            {
              id: "rec-legacy-1",
              timestamp: 1725600000000,
              date: "2026-09-06",
              modelId: "anthropic/claude-3.5-sonnet",
              provider: "anthropic",
              inputTokens: 5000,
              outputTokens: 2000,
              cachedTokens: 500,
              estimatedCostUsd: 0.045,
            },
          ],
          monthlyBudgetUsd: 1500,
        }),
        "utf-8"
      );

      const manager = new TokenMetricsManager(primaryDir, fallbackDir);
      expect(manager.getRecords()).toHaveLength(1);
      expect(manager.getRecords()[0].id).toBe("rec-legacy-1");
      expect(manager.getMonthlyBudget()).toBe(1500);

      // Record new usage
      manager.recordUsage({
        modelId: "google/gemini-2.5-pro",
        inputTokens: 10000,
        outputTokens: 5000,
      });

      // Primary file created
      const primaryMetrics = path.join(primaryDir, "usage_metrics.json");
      expect(fs.existsSync(primaryMetrics)).toBe(true);
      const primaryData = JSON.parse(fs.readFileSync(primaryMetrics, "utf-8"));
      expect(primaryData.records).toHaveLength(2);
      expect(primaryData.monthlyBudgetUsd).toBe(1500);

      // Fallback file untouched
      const fallbackData = JSON.parse(fs.readFileSync(fallbackMetrics, "utf-8"));
      expect(fallbackData.records).toHaveLength(1);
      expect(fallbackData.records[0].id).toBe("rec-legacy-1");
    });

    it("State 3.3: Both exist -> primary takes absolute precedence", () => {
      const primaryMetrics = path.join(primaryDir, "usage_metrics.json");
      fs.writeFileSync(
        primaryMetrics,
        JSON.stringify({
          records: [
            {
              id: "rec-primary",
              timestamp: 1725600000000,
              date: "2026-09-06",
              modelId: "openai/o3-mini",
              provider: "openai",
              inputTokens: 200,
              outputTokens: 100,
              cachedTokens: 0,
              estimatedCostUsd: 0.001,
            },
          ],
          monthlyBudgetUsd: 5000,
        }),
        "utf-8"
      );

      const fallbackMetrics = path.join(fallbackDir, "token_metrics.json");
      fs.writeFileSync(
        fallbackMetrics,
        JSON.stringify({
          records: [
            {
              id: "rec-fallback",
              timestamp: 1725600000000,
              date: "2026-09-06",
              modelId: "anthropic/claude-3-opus",
              provider: "anthropic",
              inputTokens: 200,
              outputTokens: 100,
              cachedTokens: 0,
              estimatedCostUsd: 0.01,
            },
          ],
          monthlyBudgetUsd: 1000,
        }),
        "utf-8"
      );

      const manager = new TokenMetricsManager(primaryDir, fallbackDir);
      expect(manager.getRecords()).toHaveLength(1);
      expect(manager.getRecords()[0].modelId).toBe("openai/o3-mini");
      expect(manager.getMonthlyBudget()).toBe(5000);
    });

    it("State 3.4: Neither exists -> seeds realistic metrics in primary without touching fallback", () => {
      const manager = new TokenMetricsManager(primaryDir, fallbackDir);
      expect(manager.getRecords().length).toBeGreaterThan(0);
      expect(manager.getMonthlyBudget()).toBe(2000);

      const primaryMetrics = path.join(primaryDir, "usage_metrics.json");
      expect(fs.existsSync(primaryMetrics)).toBe(true);

      const fallbackMetrics = path.join(fallbackDir, "token_metrics.json");
      expect(fs.existsSync(fallbackMetrics)).toBe(false);
    });

    it("State 3.5: Directory isolation and token_metrics.json mirroring in customStorageDir", () => {
      // In customStorageDir (e.g. unit tests / temporary dir)
      const manager = new TokenMetricsManager(primaryDir);
      expect(manager.getStorageDir()).toBe(primaryDir);
      expect(manager.getFallbackStoragePath()).toBe(path.join(primaryDir, "token_metrics.json"));

      const record = manager.recordUsage({
        modelId: "anthropic/claude-3.7-sonnet",
        inputTokens: 4000,
        outputTokens: 1000,
      });

      const primaryMetrics = path.join(primaryDir, "usage_metrics.json");
      const mirroredMetrics = path.join(primaryDir, "token_metrics.json");

      expect(fs.existsSync(primaryMetrics)).toBe(true);
      expect(fs.existsSync(mirroredMetrics)).toBe(true);

      // Verify mirrored file has byte-for-byte identical parsed data
      const primaryData = JSON.parse(fs.readFileSync(primaryMetrics, "utf-8"));
      const mirroredData = JSON.parse(fs.readFileSync(mirroredMetrics, "utf-8"));

      expect(primaryData.records.length).toBe(mirroredData.records.length);
      expect(primaryData.records[primaryData.records.length - 1].id).toBe(record.id);
      expect(mirroredData.records[mirroredData.records.length - 1].id).toBe(record.id);
      expect(primaryData.monthlyBudgetUsd).toBe(mirroredData.monthlyBudgetUsd);
    });

    it("State 3.6: Backward compatibility test harness simulation", () => {
      // Simulates existing test suites that write legacy token_metrics.json to a temp dir and instantiate TokenMetricsManager
      const testDir = path.join(os.tmpdir(), `challenger2-compat-${Date.now()}`);
      fs.mkdirSync(testDir, { recursive: true });

      try {
        const legacyFile = path.join(testDir, "token_metrics.json");
        fs.writeFileSync(
          legacyFile,
          JSON.stringify({
            records: [
              {
                id: "compat-rec",
                timestamp: Date.now(),
                date: "2026-09-06",
                modelId: "meta-llama/llama-3.1-405b-instruct",
                provider: "meta-llama",
                inputTokens: 50000,
                outputTokens: 10000,
                cachedTokens: 0,
                estimatedCostUsd: 0.048,
              },
            ],
            monthlyBudgetUsd: 2500,
          }),
          "utf-8"
        );

        // Pre-existing test suite instantiation with just tempDir
        const manager = new TokenMetricsManager(testDir);
        expect(manager.getRecords()).toHaveLength(1);
        expect(manager.getRecords()[0].id).toBe("compat-rec");

        // Record another usage
        manager.recordUsage({
          modelId: "meta-llama/llama-3.3-70b-instruct",
          inputTokens: 1000,
          outputTokens: 500,
        });

        // Pre-existing tests asserting path.join(testDir, "token_metrics.json")
        expect(fs.existsSync(legacyFile)).toBe(true);
        const updatedLegacy = JSON.parse(fs.readFileSync(legacyFile, "utf-8"));
        expect(updatedLegacy.records).toHaveLength(2);
        expect(updatedLegacy.records[1].modelId).toBe("meta-llama/llama-3.3-70b-instruct");
      } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });
  });

  // =========================================================================
  // 4. Stress Testing & Edge Cases
  // =========================================================================
  describe("4. Stress Testing & Edge Cases", () => {
    it("handles 50 rapid sequential usage records without file corruption or race conditions", () => {
      const manager = new TokenMetricsManager(primaryDir);
      const initialCount = manager.getRecords().length;

      for (let i = 0; i < 50; i++) {
        manager.recordUsage({
          modelId: "openai/gpt-4o-mini",
          inputTokens: 100 + i,
          outputTokens: 50 + i,
          command: `/test-${i}`,
        });
      }

      const records = manager.getRecords();
      expect(records.length).toBe(initialCount + 50);

      // Verify file integrity
      const primaryFile = path.join(primaryDir, "usage_metrics.json");
      const diskData = JSON.parse(fs.readFileSync(primaryFile, "utf-8"));
      expect(diskData.records.length).toBe(initialCount + 50);

      const mirrorFile = path.join(primaryDir, "token_metrics.json");
      const mirrorData = JSON.parse(fs.readFileSync(mirrorFile, "utf-8"));
      expect(mirrorData.records.length).toBe(initialCount + 50);
    });

    it("UserConfigManager handles non-existent parent directory creation automatically", () => {
      const deepPrimaryDir = path.join(primaryDir, "nested", "level1", "level2");
      const manager = new UserConfigManager(deepPrimaryDir, fallbackDir);
      manager.setApiKey("openrouter", "sk-nested-key");

      expect(fs.existsSync(path.join(deepPrimaryDir, "config.json"))).toBe(true);
      const data = JSON.parse(fs.readFileSync(path.join(deepPrimaryDir, "config.json"), "utf-8"));
      expect(data.apiKeys.openrouter).toBe("sk-nested-key");
    });

    it("ModelCatalogCache handles non-existent parent directory creation automatically", () => {
      const deepPrimaryDir = path.join(primaryDir, "nested-cache", "lvl1");
      const cache = new ModelCatalogCache(deepPrimaryDir, 3600000, fallbackDir);
      cache.saveModels([
        {
          id: "google/gemini-2.0-flash",
          name: "Gemini 2.0 Flash",
          provider: "google",
          contextLength: 1_000_000,
          promptPricePerM: 0.1,
          completionPricePerM: 0.4,
        },
      ]);

      expect(fs.existsSync(path.join(deepPrimaryDir, "models_cache.json"))).toBe(true);
    });

    it("TUI facades maintain identical prototype and interface identity", () => {
      expect(TuiModelCatalogCache).toBe(ModelCatalogCache);
      expect(TuiTokenMetricsManager).toBe(TokenMetricsManager);
      expect(TokenUsageTracker).toBe(TokenMetricsManager);
    });

    it("verifies production default paths match ~/.antigravity and ~/.anantham contracts", () => {
      const defaultUserConfig = new UserConfigManager();
      expect(defaultUserConfig.getConfigDir()).toBe(path.join(os.homedir(), ".antigravity"));
      expect(defaultUserConfig.getConfigPath()).toBe(path.join(os.homedir(), ".antigravity", "config.json"));
      expect(defaultUserConfig.getFallbackConfigDir()).toBe(path.join(os.homedir(), ".anantham"));
      expect(defaultUserConfig.getFallbackConfigPath()).toBe(path.join(os.homedir(), ".anantham", "config.json"));

      const defaultModelCache = new ModelCatalogCache();
      expect(defaultModelCache.getStorageDir()).toBe(path.join(os.homedir(), ".antigravity"));
      expect(defaultModelCache.getStoragePath()).toBe(path.join(os.homedir(), ".antigravity", "models_cache.json"));
      expect(defaultModelCache.getFallbackStoragePath()).toBe(
        path.join(os.homedir(), ".anantham", "models_cache.json")
      );

      const defaultTokenMetrics = new TokenMetricsManager();
      expect(defaultTokenMetrics.getStorageDir()).toBe(path.join(os.homedir(), ".antigravity"));
      expect(defaultTokenMetrics.getStoragePath()).toBe(path.join(os.homedir(), ".antigravity", "usage_metrics.json"));
      expect(defaultTokenMetrics.getFallbackStoragePath()).toBe(
        path.join(os.homedir(), ".anantham", "token_metrics.json")
      );
    });

    it("UserConfigManager preserves full schema fields (theme, logoPath, customModels, keyMetadata) during migration", () => {
      const fallbackFile = path.join(fallbackDir, "config.json");
      fs.writeFileSync(
        fallbackFile,
        JSON.stringify({
          apiKeys: { openai: "sk-legacy-key" },
          keyMetadata: {
            openai: {
              label: "Legacy Enterprise",
              limit: 500,
              usage: 123.45,
              is_free_tier: false,
              validatedAt: "2026-09-01T00:00:00.000Z",
            },
          },
          defaultModel: "openai/gpt-4o",
          theme: "cyberpunk",
          customModels: ["my-fine-tuned-model", "deepseek-coder-6.7b"],
          logoPath: "/custom/assets/logo.png",
        }),
        "utf-8"
      );

      const manager = new UserConfigManager(primaryDir, fallbackDir);
      expect(manager.getApiKey("openai")).toBe("sk-legacy-key");
      expect(manager.getKeyMetadata("openai")?.label).toBe("Legacy Enterprise");
      expect(manager.getDefaultModel()).toBe("openai/gpt-4o");
      expect(manager.getCustomModels()).toEqual(["my-fine-tuned-model", "deepseek-coder-6.7b"]);
      expect(manager.getLogoPath()).toBe("/custom/assets/logo.png");

      // Add a custom model, triggering migration save to primary
      manager.addCustomModel("claude-3.7-custom");

      const primaryFile = path.join(primaryDir, "config.json");
      expect(fs.existsSync(primaryFile)).toBe(true);

      const migrated = JSON.parse(fs.readFileSync(primaryFile, "utf-8"));
      expect(migrated.apiKeys.openai).toBe("sk-legacy-key");
      expect(migrated.keyMetadata.openai.label).toBe("Legacy Enterprise");
      expect(migrated.defaultModel).toBe("openai/gpt-4o");
      expect(migrated.theme).toBe("cyberpunk");
      expect(migrated.logoPath).toBe("/custom/assets/logo.png");
      expect(migrated.customModels).toEqual(["my-fine-tuned-model", "deepseek-coder-6.7b", "claude-3.7-custom"]);

      // Verify fallback file was not modified
      const fallbackAfter = JSON.parse(fs.readFileSync(fallbackFile, "utf-8"));
      expect(fallbackAfter.customModels).toEqual(["my-fine-tuned-model", "deepseek-coder-6.7b"]);
    });

    it("TokenMetricsManager calculates analytics (daily, MTD, trend, top models) seamlessly from migrated fallback records", () => {
      const today = new Date().toISOString().slice(0, 10);
      const fallbackMetrics = path.join(fallbackDir, "token_metrics.json");
      fs.writeFileSync(
        fallbackMetrics,
        JSON.stringify({
          records: [
            {
              id: "rec-1",
              timestamp: Date.now() - 1000,
              date: today,
              modelId: "anthropic/claude-3.5-sonnet",
              provider: "anthropic",
              inputTokens: 10000,
              outputTokens: 2000,
              cachedTokens: 2500,
              estimatedCostUsd: 0.06075,
            },
            {
              id: "rec-2",
              timestamp: Date.now() - 500,
              date: today,
              modelId: "openai/gpt-4o",
              provider: "openai",
              inputTokens: 8000,
              outputTokens: 1000,
              cachedTokens: 0,
              estimatedCostUsd: 0.03,
            },
          ],
          monthlyBudgetUsd: 1000,
        }),
        "utf-8"
      );

      const manager = new TokenMetricsManager(primaryDir, fallbackDir);

      const daily = manager.getDailySummary(today);
      expect(daily.totalInputTokens).toBe(18000);
      expect(daily.totalOutputTokens).toBe(3000);
      expect(daily.totalCachedTokens).toBe(2500);
      expect(daily.totalTokens).toBe(23500);
      expect(daily.requestCount).toBe(2);

      const mtd = manager.getMtdSummary();
      expect(mtd.requestCount).toBe(2);
      expect(mtd.totalTokens).toBe(23500);

      const topModels = manager.getTopModels();
      expect(topModels).toHaveLength(2);
      expect(topModels[0].modelId).toBe("anthropic/claude-3.5-sonnet");

      const trend = manager.getSevenDayTrend();
      expect(trend).toHaveLength(7);
      const todayTrend = trend.find((t) => t.date === today);
      expect(todayTrend?.tokens).toBe(23500);
    });
  });
});
