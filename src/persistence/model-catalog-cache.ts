import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { UserConfigManager } from "./user-config-manager.js";

export interface CachedModel {
  id: string;
  name: string;
  provider: string; // "openai", "anthropic", "google", "deepseek", "meta-llama", "virtuals", "other"
  contextLength: number;
  promptPricePerM: number;
  completionPricePerM: number;
  description?: string;
}

export interface ModelCacheData {
  fetchedAt: number;
  ttlMs: number; // default 3600000 (1 hour)
  models: CachedModel[];
}

export interface RawOpenRouterPricing {
  prompt?: string | number;
  completion?: string | number;
  request?: string | number;
  image?: string | number;
}

export interface RawOpenRouterModel {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
  pricing?: RawOpenRouterPricing;
}

export interface RawOpenRouterResponse {
  data?: RawOpenRouterModel[];
}

/**
 * Normalizes an OpenRouter model ID into a standardized provider string.
 */
export function normalizeProvider(rawId: string): string {
  const cleanId = rawId.startsWith("openrouter/") ? rawId.slice("openrouter/".length) : rawId;
  const parts = cleanId.split("/");
  if (parts.length >= 2 && parts[0]) {
    const p = parts[0].toLowerCase();
    if (p === "openai") return "openai";
    if (p === "anthropic") return "anthropic";
    if (p === "google") return "google";
    if (p === "deepseek") return "deepseek";
    if (p === "meta-llama" || p === "meta" || p === "llama") return "meta-llama";
    if (p === "virtuals") return "virtuals";
    return p;
  }
  return "other";
}

/**
 * Parses per-token pricing to price per 1 Million tokens.
 */
export function parsePricePerM(rawPrice?: string | number): number {
  if (rawPrice === undefined || rawPrice === null) return 0;
  const num = typeof rawPrice === "number" ? rawPrice : parseFloat(String(rawPrice));
  if (isNaN(num) || num <= 0) return 0;
  const perM = num * 1_000_000;
  return Number(perM.toFixed(4));
}

/**
 * Persistent cache manager for OpenRouter live catalog models.
 * Saves to ~/.anantham/models_cache.json with 1-hour TTL and atomic writes.
 */
export class ModelCatalogCache {
  private static instance: ModelCatalogCache | undefined;
  private readonly storageDir: string;
  private readonly storagePath: string;
  private readonly ttlMs: number;
  private memoryCache: ModelCacheData | null = null;

  public static readonly DEFAULT_TTL_MS = 3_600_000; // 1 hour

  /**
   * Curated high-performance fallback models across the 6 major providers.
   */
  public static readonly CURATED_MODELS: CachedModel[] = [
    // Anthropic
    {
      id: "anthropic/claude-3.5-sonnet",
      name: "Claude 3.5 Sonnet",
      provider: "anthropic",
      contextLength: 200_000,
      promptPricePerM: 3.0,
      completionPricePerM: 15.0,
      description: "Anthropic's flagship intelligent and balanced reasoning model",
    },
    {
      id: "anthropic/claude-3.7-sonnet",
      name: "Claude 3.7 Sonnet",
      provider: "anthropic",
      contextLength: 200_000,
      promptPricePerM: 3.0,
      completionPricePerM: 15.0,
      description: "Anthropic's premier hybrid reasoning and coding model",
    },
    {
      id: "anthropic/claude-3.5-haiku",
      name: "Claude 3.5 Haiku",
      provider: "anthropic",
      contextLength: 200_000,
      promptPricePerM: 0.8,
      completionPricePerM: 4.0,
      description: "Ultra-fast lightweight model with near-Sonnet performance",
    },
    {
      id: "anthropic/claude-3-opus",
      name: "Claude 3 Opus",
      provider: "anthropic",
      contextLength: 200_000,
      promptPricePerM: 15.0,
      completionPricePerM: 75.0,
      description: "Anthropic's highest-power model for complex creative and scientific work",
    },
    // OpenAI
    {
      id: "openai/gpt-4o",
      name: "GPT-4o",
      provider: "openai",
      contextLength: 128_000,
      promptPricePerM: 2.5,
      completionPricePerM: 10.0,
      description: "OpenAI versatile high-intelligence multimodal flagship",
    },
    {
      id: "openai/gpt-4o-mini",
      name: "GPT-4o Mini",
      provider: "openai",
      contextLength: 128_000,
      promptPricePerM: 0.15,
      completionPricePerM: 0.6,
      description: "Affordable, fast, lightweight model for high-frequency tasks",
    },
    {
      id: "openai/o1",
      name: "o1 Reasoning",
      provider: "openai",
      contextLength: 200_000,
      promptPricePerM: 15.0,
      completionPricePerM: 60.0,
      description: "Deep chain-of-thought model designed for math, coding, and science",
    },
    {
      id: "openai/o3-mini",
      name: "o3 Mini",
      provider: "openai",
      contextLength: 200_000,
      promptPricePerM: 1.1,
      completionPricePerM: 4.4,
      description: "Fast reasoning model optimized for STEM and coding workflows",
    },
    // Google
    {
      id: "google/gemini-2.5-pro",
      name: "Gemini 2.5 Pro",
      provider: "google",
      contextLength: 1_000_000,
      promptPricePerM: 1.25,
      completionPricePerM: 5.0,
      description: "Google's ultra-long context reasoning and multimodal powerhouse",
    },
    {
      id: "google/gemini-2.0-flash",
      name: "Gemini 2.0 Flash",
      provider: "google",
      contextLength: 1_000_000,
      promptPricePerM: 0.1,
      completionPricePerM: 0.4,
      description: "Low-latency multimodal model with 1M context window",
    },
    {
      id: "google/gemini-1.5-pro",
      name: "Gemini 1.5 Pro",
      provider: "google",
      contextLength: 2_000_000,
      promptPricePerM: 1.25,
      completionPricePerM: 5.0,
      description: "2M token context window for massive codebase ingestion",
    },
    // DeepSeek
    {
      id: "deepseek/deepseek-r1",
      name: "DeepSeek R1",
      provider: "deepseek",
      contextLength: 64_000,
      promptPricePerM: 0.55,
      completionPricePerM: 2.19,
      description: "Open-weights reasoning model with exceptional STEM performance",
    },
    {
      id: "deepseek/deepseek-chat",
      name: "DeepSeek V3",
      provider: "deepseek",
      contextLength: 64_000,
      promptPricePerM: 0.14,
      completionPricePerM: 0.28,
      description: "High-efficiency MoE language model with top benchmark scores",
    },
    // Meta / Llama
    {
      id: "meta-llama/llama-3.3-70b-instruct",
      name: "Llama 3.3 70B Instruct",
      provider: "meta-llama",
      contextLength: 128_000,
      promptPricePerM: 0.12,
      completionPricePerM: 0.3,
      description: "Industry-standard open model with state-of-the-art 70B weights",
    },
    {
      id: "meta-llama/llama-3.1-405b-instruct",
      name: "Llama 3.1 405B Instruct",
      provider: "meta-llama",
      contextLength: 128_000,
      promptPricePerM: 0.8,
      completionPricePerM: 0.8,
      description: "Frontier open-weights 405B parameter instruction model",
    },
    {
      id: "meta-llama/llama-3.1-8b-instruct",
      name: "Llama 3.1 8B Instruct",
      provider: "meta-llama",
      contextLength: 128_000,
      promptPricePerM: 0.05,
      completionPricePerM: 0.05,
      description: "Compact, extremely fast open model for low-latency agent loops",
    },
    // Virtuals
    {
      id: "virtuals/game-agent",
      name: "Virtuals GAME Agent",
      provider: "virtuals",
      contextLength: 32_000,
      promptPricePerM: 0.5,
      completionPricePerM: 1.5,
      description: "On-chain autonomous agent execution model",
    },
    {
      id: "virtuals/sentient-ai",
      name: "Virtuals Sentient AI",
      provider: "virtuals",
      contextLength: 32_000,
      promptPricePerM: 1.0,
      completionPricePerM: 3.0,
      description: "Interactive autonomous agent persona and simulation model",
    },
  ];

  public constructor(customStorageDir?: string, ttlMs: number = ModelCatalogCache.DEFAULT_TTL_MS) {
    this.storageDir = customStorageDir || path.join(os.homedir(), ".anantham");
    this.storagePath = path.join(this.storageDir, "models_cache.json");
    this.ttlMs = ttlMs;
    this.loadFromDisk();
  }

  public static getInstance(customStorageDir?: string, ttlMs?: number): ModelCatalogCache {
    if (!ModelCatalogCache.instance || customStorageDir !== undefined) {
      ModelCatalogCache.instance = new ModelCatalogCache(customStorageDir, ttlMs);
    }
    return ModelCatalogCache.instance;
  }

  public static resetInstance(): void {
    ModelCatalogCache.instance = undefined;
  }

  /**
   * Reads cached models from disk if present and valid.
   */
  private loadFromDisk(): ModelCacheData | null {
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, "utf-8");
        const parsed = JSON.parse(raw) as ModelCacheData;
        if (
          parsed &&
          typeof parsed.fetchedAt === "number" &&
          Array.isArray(parsed.models) &&
          parsed.models.length > 0
        ) {
          this.memoryCache = parsed;
          return parsed;
        }
      }
    } catch {
      // Fallback on read or JSON parse failure
    }
    return null;
  }

  /**
   * Synchronously returns cached models from memory or disk if available.
   */
  public getCachedModels(): CachedModel[] | null {
    if (this.memoryCache && Array.isArray(this.memoryCache.models)) {
      return this.memoryCache.models;
    }
    const loaded = this.loadFromDisk();
    return loaded ? loaded.models : null;
  }

  /**
   * Checks whether the current cache is within its valid TTL window.
   */
  public isCacheFresh(): boolean {
    if (!this.memoryCache) {
      this.loadFromDisk();
    }
    if (!this.memoryCache) {
      return false;
    }
    const age = Date.now() - this.memoryCache.fetchedAt;
    return age >= 0 && age < (this.memoryCache.ttlMs || this.ttlMs);
  }

  /**
   * Saves models atomically to memory and disk using a temporary file and atomic rename.
   */
  public saveModels(models: CachedModel[]): void {
    const data: ModelCacheData = {
      fetchedAt: Date.now(),
      ttlMs: this.ttlMs,
      models,
    };
    this.memoryCache = data;

    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
      const tmpPath = path.join(
        this.storageDir,
        `models_cache.json.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`
      );
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");

      try {
        fs.renameSync(tmpPath, this.storagePath);
      } catch {
        // Windows fallback: if renameSync encounters locking, copy and unlink
        fs.copyFileSync(tmpPath, this.storagePath);
        try {
          fs.unlinkSync(tmpPath);
        } catch {
          // Ignore temp cleanup errors
        }
      }
    } catch {
      // Non-critical cache write failure
    }
  }

  /**
   * Clears in-memory and on-disk cache.
   */
  public clearCache(): void {
    this.memoryCache = null;
    try {
      if (fs.existsSync(this.storagePath)) {
        fs.unlinkSync(this.storagePath);
      }
    } catch {
      // Ignore cleanup error
    }
  }

  /**
   * Fetches the model catalog:
   * 1. Returns fresh cache if not forceRefresh.
   * 2. Tries live OpenRouter API fetch with configured key.
   * 3. Falls back to disk cache if available.
   * 4. Falls back to built-in curated models across all 6 providers.
   */
  public async getModels(forceRefresh = false): Promise<CachedModel[]> {
    if (!forceRefresh && this.isCacheFresh()) {
      const cached = this.getCachedModels();
      if (cached && cached.length > 0) {
        return cached;
      }
    }

    const apiKey =
      UserConfigManager.getInstance().getApiKey("openrouter") || process.env.OPENROUTER_API_KEY;

    try {
      const headers: Record<string, string> = {
        "HTTP-Referer": "https://anantham.ai",
        "X-Title": "Anantham V2",
      };
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      const response = await fetch("https://openrouter.ai/api/v1/models", {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter models API returned HTTP ${response.status}: ${response.statusText}`);
      }

      const json = (await response.json()) as RawOpenRouterResponse;
      if (json && Array.isArray(json.data) && json.data.length > 0) {
        const normalized: CachedModel[] = json.data.map((m) => {
          const provider = normalizeProvider(m.id);
          const promptPricePerM = parsePricePerM(m.pricing?.prompt);
          const completionPricePerM = parsePricePerM(m.pricing?.completion);
          const contextLength = typeof m.context_length === "number" ? m.context_length : 4096;

          return {
            id: m.id,
            name: m.name && m.name.trim().length > 0 ? m.name : m.id,
            provider,
            contextLength,
            promptPricePerM,
            completionPricePerM,
            description: m.description,
          };
        });

        this.saveModels(normalized);
        return normalized;
      }
    } catch {
      // Network fetch failure or timeout: proceed to fallbacks
    }

    // Fallback 1: Disk or memory cache (even if expired)
    const existing = this.getCachedModels();
    if (existing && existing.length > 0) {
      return existing;
    }

    // Fallback 2: Comprehensive curated models across all 6 providers
    this.saveModels(ModelCatalogCache.CURATED_MODELS);
    return ModelCatalogCache.CURATED_MODELS;
  }
}
