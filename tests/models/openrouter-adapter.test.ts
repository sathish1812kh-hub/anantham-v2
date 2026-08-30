import { describe, it, expect } from "vitest";
import { OpenRouterProviderAdapter } from "../../src/models/adapters/openrouter-adapter.js";

describe("OpenRouterProviderAdapter - OpenRouter Aggregation & Routing Headers", () => {
  it("injects HTTP-Referer and X-Title headers and normalizes multi-provider response", async () => {
    let capturedHeaders: Record<string, string> = {};

    const mockFetch = async (_url: any, options: any) => {
      capturedHeaders = options.headers;
      return new Response(
        JSON.stringify({
          id: "gen-or-12345",
          model: "anthropic/claude-3.5-sonnet",
          choices: [
            {
              message: { role: "assistant", content: "Routed via OpenRouter to Claude Sonnet" },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 30,
            completion_tokens: 12,
            total_tokens: 42,
          },
        }),
        { status: 200 }
      );
    };

    const adapter = new OpenRouterProviderAdapter({
      apiKey: "sk-or-v1-testkey",
      siteUrl: "https://anantham.ai",
      siteName: "Anantham V2 Platform",
      fetchFn: mockFetch as any,
    });

    const res = await adapter.send({
      modelId: "anthropic/claude-3.5-sonnet",
      messages: [{ role: "user", content: "Run cross-provider test" }],
    });

    expect(capturedHeaders["HTTP-Referer"]).toBe("https://anantham.ai");
    expect(capturedHeaders["X-Title"]).toBe("Anantham V2 Platform");
    expect(capturedHeaders["Authorization"]).toBe("Bearer sk-or-v1-testkey");

    expect(adapter.providerId).toBe("openrouter");
    expect(res.modelId).toBe("anthropic/claude-3.5-sonnet");
    expect(res.message.content).toBe("Routed via OpenRouter to Claude Sonnet");
    expect(res.usage?.totalTokens).toBe(42);
  });
});
