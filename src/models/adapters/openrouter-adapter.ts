import {
  OpenAICompatibleAdapter,
  type OpenAICompatibleAdapterOptions,
} from "./openai-compatible-adapter.js";
import type { ProviderCapabilities } from "../provider-adapter.js";

export interface OpenRouterProviderAdapterOptions extends Omit<OpenAICompatibleAdapterOptions, "baseUrl" | "providerId"> {
  siteUrl?: string;
  siteName?: string;
}

/**
 * OpenRouter aggregation provider adapter.
 * PRD Part 2 Section 42.
 */
export class OpenRouterProviderAdapter extends OpenAICompatibleAdapter {
  constructor(options: OpenRouterProviderAdapterOptions = {}) {
    super({
      ...options,
      providerId: "openrouter",
      name: "OpenRouter AI Aggregator",
      baseUrl: "https://openrouter.ai/api/v1",
      customHeaders: {
        "HTTP-Referer": options.siteUrl || "https://anantham.ai",
        "X-Title": options.siteName || "Anantham V2",
        ...options.customHeaders,
      },
    });
  }

  public override getCapabilities(_modelId: string): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsTools: true,
      supportsVision: true,
      supportsAudio: false,
      maxContextTokens: 128000,
      maxOutputTokens: 4096,
    };
  }
}
