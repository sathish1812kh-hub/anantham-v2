import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  ModelCatalogCache,
  normalizeProvider,
  parsePricePerM,
  type CachedModel,
} from "../../src/persistence/model-catalog-cache.js";
import { UserConfigManager } from "../../src/persistence/user-config-manager.js";

describe("ModelCatalogCache", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `anantham-model-cache-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    fs.mkdirSync(tempDir, { recursive: true });
    ModelCatalogCache.resetInstance();
  });

  afterEach(() => {
    ModelCatalogCache.resetInstance();
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup error
    }
    vi.restoreAllMocks();
  });

  describe("normalizeProvider", () => {
    it("normalizes standard provider prefixes accurately", () => {
      expect(normalizeProvider("anthropic/claude-3.5-sonnet")).toBe("anthropic");
      expect(normalizeProvider("openai/gpt-4o")).toBe("openai");
      expect(normalizeProvider("google/gemini-2.5-pro")).toBe("google");
      expect(normalizeProvider("deepseek/deepseek-r1")).toBe("deepseek");
      expect(normalizeProvider("meta-llama/llama-3.3-70b-instruct")).toBe("meta-llama");
      expect(normalizeProvider("meta/llama-3.1")).toBe("meta-llama");
      expect(normalizeProvider("llama/llama-3-8b")).toBe("meta-llama");
      expect(normalizeProvider("virtuals/game-agent")).toBe("virtuals");
    });

    it("strips openrouter/ prefix correctly", () => {
      expect(normalizeProvider("openrouter/anthropic/claude-3.5-sonnet")).toBe("anthropic");
      expect(normalizeProvider("openrouter/openai/gpt-4o")).toBe("openai");
      expect(normalizeProvider("openrouter/deepseek/deepseek-chat")).toBe("deepseek");
    });

    it("handles other providers or unprefixed IDs", () => {
      expect(normalizeProvider("mistralai/mistral-large")).toBe("mistralai");
      expect(normalizeProvider("qwen/qwen-2.5-coder-32b")).toBe("qwen");
      expect(normalizeProvider("bare-model-without-slash")).toBe("other");
    });
  });

  describe("parsePricePerM", () => {
    it("converts per-token prices to per 1M tokens accurately", () => {
      expect(parsePricePerM("0.000003")).toBe(3.0);
      expect(parsePricePerM("0.000015")).toBe(15.0);
      expect(parsePricePerM("0.00000015")).toBe(0.15);
      expect(parsePricePerM(0.0000025)).toBe(2.5);
    });

    it("safely handles undefined, null, zero, and invalid values", () => {
      expect(parsePricePerM(undefined)).toBe(0);
      expect(parsePricePerM(null as unknown as undefined)).toBe(0);
      expect(parsePricePerM("0")).toBe(0);
      expect(parsePricePerM("-1.5")).toBe(0);
      expect(parsePricePerM("invalid-num")).toBe(0);
    });
  });

  describe("Curated Fallback Models", () => {
    it("contains robust models across all 6 core providers", () => {
      const models = ModelCatalogCache.CURATED_MODELS;
      expect(models.length).toBeGreaterThanOrEqual(15);

      const providers = new Set(models.map((m) => m.provider));
      expect(providers.has("anthropic")).toBe(true);
      expect(providers.has("openai")).toBe(true);
      expect(providers.has("google")).toBe(true);
      expect(providers.has("deepseek")).toBe(true);
      expect(providers.has("meta-llama")).toBe(true);
      expect(providers.has("virtuals")).toBe(true);

      for (const m of models) {
        expect(m.id).toBeTruthy();
        expect(m.name).toBeTruthy();
        expect(m.contextLength).toBeGreaterThan(0);
        expect(m.promptPricePerM).toBeGreaterThanOrEqual(0);
        expect(m.completionPricePerM).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("Disk Persistence & Atomic Write", () => {
    it("saves models atomically to models_cache.json without leftover temporary files", () => {
      const cache = ModelCatalogCache.getInstance(tempDir);
      const testModels: CachedModel[] = [
        {
          id: "test/model-1",
          name: "Test Model 1",
          provider: "test",
          contextLength: 64000,
          promptPricePerM: 1.0,
          completionPricePerM: 2.0,
          description: "Test description",
        },
      ];

      cache.saveModels(testModels);

      const cacheFile = path.join(tempDir, "models_cache.json");
      expect(fs.existsSync(cacheFile)).toBe(true);

      // Verify no temporary files remain
      const files = fs.readdirSync(tempDir);
      const tmpFiles = files.filter((f) => f.includes(".tmp"));
      expect(tmpFiles.length).toBe(0);

      // Read back content
      const cached = cache.getCachedModels();
      expect(cached).toHaveLength(1);
      expect(cached![0]!.id).toBe("test/model-1");

      // Verify fresh instance reloads from disk
      ModelCatalogCache.resetInstance();
      const reloadedCache = ModelCatalogCache.getInstance(tempDir);
      const reloadedModels = reloadedCache.getCachedModels();
      expect(reloadedModels).toHaveLength(1);
      expect(reloadedModels![0]!.name).toBe("Test Model 1");
    });

    it("clears cache from memory and disk", () => {
      const cache = ModelCatalogCache.getInstance(tempDir);
      cache.saveModels(ModelCatalogCache.CURATED_MODELS);
      expect(cache.getCachedModels()?.length).toBeGreaterThan(0);

      cache.clearCache();
      expect(cache.getCachedModels()).toBeNull();
      const cacheFile = path.join(tempDir, "models_cache.json");
      expect(fs.existsSync(cacheFile)).toBe(false);
    });
  });

  describe("TTL Expiration & Freshness", () => {
    it("correctly evaluates cache freshness based on TTL", async () => {
      const shortTtlMs = 40;
      const cache = ModelCatalogCache.getInstance(tempDir, shortTtlMs);

      expect(cache.isCacheFresh()).toBe(false);

      cache.saveModels(ModelCatalogCache.CURATED_MODELS);
      expect(cache.isCacheFresh()).toBe(true);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(cache.isCacheFresh()).toBe(false);
    });
  });

  describe("Live Catalog Fetch & Fallbacks", () => {
    it("successfully fetches, parses, and saves models from OpenRouter API", async () => {
      const mockApiResponse = {
        data: [
          {
            id: "openai/gpt-4o-2024-11-20",
            name: "GPT-4o (2024-11-20)",
            description: "Latest GPT-4o snapshot",
            context_length: 128000,
            pricing: {
              prompt: "0.0000025",
              completion: "0.00001",
            },
          },
          {
            id: "anthropic/claude-3.5-haiku",
            name: "Claude 3.5 Haiku",
            context_length: 200000,
            pricing: {
              prompt: "0.0000008",
              completion: "0.000004",
            },
          },
        ],
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => mockApiResponse,
      } as unknown as Response);

      const cache = ModelCatalogCache.getInstance(tempDir);
      const models = await cache.getModels(true);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(models).toHaveLength(2);

      const gpt4o = models.find((m) => m.id === "openai/gpt-4o-2024-11-20");
      expect(gpt4o).toBeDefined();
      expect(gpt4o?.provider).toBe("openai");
      expect(gpt4o?.contextLength).toBe(128000);
      expect(gpt4o?.promptPricePerM).toBe(2.5);
      expect(gpt4o?.completionPricePerM).toBe(10.0);

      const haiku = models.find((m) => m.id === "anthropic/claude-3.5-haiku");
      expect(haiku?.provider).toBe("anthropic");
      expect(haiku?.promptPricePerM).toBe(0.8);
      expect(haiku?.completionPricePerM).toBe(4.0);

      // Verify cached on disk
      expect(fs.existsSync(path.join(tempDir, "models_cache.json"))).toBe(true);
    });

    it("injects API key authorization header when configured", async () => {
      const userConfig = UserConfigManager.getInstance(tempDir);
      userConfig.setApiKey("openrouter", "sk-or-v1-testkey123");

      let capturedHeaders: Record<string, string> | undefined;
      vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (_url, init) => {
        capturedHeaders = init?.headers as Record<string, string>;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                id: "deepseek/deepseek-r1",
                name: "DeepSeek R1",
                context_length: 64000,
              },
            ],
          }),
        } as unknown as Response;
      });

      const cache = ModelCatalogCache.getInstance(tempDir);
      await cache.getModels(true);

      expect(capturedHeaders?.["Authorization"]).toBe("Bearer sk-or-v1-testkey123");
      expect(capturedHeaders?.["HTTP-Referer"]).toBe("https://anantham.ai");
      expect(capturedHeaders?.["X-Title"]).toBe("Anantham V2");
    });

    it("falls back to disk cache when network fetch throws", async () => {
      const cache = ModelCatalogCache.getInstance(tempDir);
      const initialModels: CachedModel[] = [
        {
          id: "existing/disk-model",
          name: "Existing Disk Model",
          provider: "existing",
          contextLength: 32000,
          promptPricePerM: 1,
          completionPricePerM: 2,
        },
      ];
      cache.saveModels(initialModels);

      // Network fetch fails
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network connection offline"));

      const models = await cache.getModels(true);
      expect(models).toHaveLength(1);
      expect(models[0]!.id).toBe("existing/disk-model");
    });

    it("falls back to curated models when network fails and no disk cache exists", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("ENOTFOUND openrouter.ai"));

      const cache = ModelCatalogCache.getInstance(tempDir);
      const models = await cache.getModels(true);

      expect(models.length).toBeGreaterThanOrEqual(15);
      expect(models.some((m) => m.id === "anthropic/claude-3.5-sonnet")).toBe(true);
      expect(models.some((m) => m.id === "openai/gpt-4o")).toBe(true);
    });

    it("returns fresh memory cache without fetching when not forceRefresh", async () => {
      const cache = ModelCatalogCache.getInstance(tempDir);
      cache.saveModels(ModelCatalogCache.CURATED_MODELS);

      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const models = await cache.getModels(false);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(models.length).toBe(ModelCatalogCache.CURATED_MODELS.length);
    });
  });
});
