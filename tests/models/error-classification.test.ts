import { describe, it, expect } from "vitest";
import { MockProviderAdapter } from "../../src/models/mock-provider-adapter.js";
import {
  AuthenticationError,
  ContextWindowExceededError,
  ModelTimeoutError,
  ProviderUnavailableError,
  RateLimitError,
} from "../../src/models/model-errors.js";

describe("ModelAdapter - Structured Error Classification", () => {
  it("classifies 429 rate limits as RateLimitError with retryAfterMs", async () => {
    const adapter = new MockProviderAdapter({
      injectedError: "rate_limit",
      retryAfterMs: 6000,
    });

    await expect(
      adapter.send({
        modelId: "gpt-4o",
        messages: [{ role: "user", content: "Test" }],
      })
    ).rejects.toThrow(RateLimitError);

    try {
      await adapter.send({
        modelId: "gpt-4o",
        messages: [{ role: "user", content: "Test" }],
      });
    } catch (err: any) {
      expect(err).toBeInstanceOf(RateLimitError);
      expect(err.statusCode).toBe(429);
      expect(err.retryAfterMs).toBe(6000);
    }
  });

  it("classifies 401 invalid credentials as AuthenticationError", async () => {
    const adapter = new MockProviderAdapter({ injectedError: "auth" });
    await expect(
      adapter.send({
        modelId: "claude-3-5",
        messages: [{ role: "user", content: "Test" }],
      })
    ).rejects.toThrow(AuthenticationError);
  });

  it("classifies context overflows as ContextWindowExceededError", async () => {
    const adapter = new MockProviderAdapter({ injectedError: "context_overflow" });
    await expect(
      adapter.send({
        modelId: "claude-3-5",
        messages: [{ role: "user", content: "Test" }],
      })
    ).rejects.toThrow(ContextWindowExceededError);
  });

  it("classifies timeouts as ModelTimeoutError", async () => {
    const adapter = new MockProviderAdapter({ injectedError: "timeout" });
    await expect(
      adapter.send({
        modelId: "claude-3-5",
        messages: [{ role: "user", content: "Test" }],
      })
    ).rejects.toThrow(ModelTimeoutError);
  });

  it("classifies 503 outages as ProviderUnavailableError", async () => {
    const adapter = new MockProviderAdapter({ injectedError: "unavailable" });
    await expect(
      adapter.send({
        modelId: "claude-3-5",
        messages: [{ role: "user", content: "Test" }],
      })
    ).rejects.toThrow(ProviderUnavailableError);
  });
});
