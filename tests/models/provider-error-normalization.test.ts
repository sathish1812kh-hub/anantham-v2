import { describe, it, expect } from "vitest";
import { OpenAICompatibleAdapter } from "../../src/models/adapters/openai-compatible-adapter.js";
import {
  AuthenticationError,
  RateLimitError,
  ModelTimeoutError,
  ProviderUnavailableError,
  ContextWindowExceededError,
} from "../../src/models/model-errors.js";

describe("Cross-Provider HTTP Error Normalization Matrix", () => {
  const req = { modelId: "test-model", messages: [{ role: "user" as const, content: "hi" }] };

  it("normalizes HTTP 401/403 to AuthenticationError", async () => {
    const fetchFn = async () => new Response(JSON.stringify({ error: { message: "Unauthorized" } }), { status: 401 });
    const adapter = new OpenAICompatibleAdapter({ fetchFn: fetchFn as any });
    await expect(adapter.send(req)).rejects.toThrow(AuthenticationError);
  });

  it("normalizes HTTP 429 to RateLimitError", async () => {
    const fetchFn = async () => new Response(JSON.stringify({ error: { message: "Too many requests" } }), { status: 429 });
    const adapter = new OpenAICompatibleAdapter({ fetchFn: fetchFn as any });
    await expect(adapter.send(req)).rejects.toThrow(RateLimitError);
  });

  it("normalizes HTTP 408 to ModelTimeoutError", async () => {
    const fetchFn = async () => new Response(JSON.stringify({ error: { message: "Request timeout" } }), { status: 408 });
    const adapter = new OpenAICompatibleAdapter({ fetchFn: fetchFn as any });
    await expect(adapter.send(req)).rejects.toThrow(ModelTimeoutError);
  });

  it("normalizes HTTP 500/502/503/504 to ProviderUnavailableError", async () => {
    const fetchFn = async () => new Response(JSON.stringify({ error: { message: "Bad Gateway" } }), { status: 502 });
    const adapter = new OpenAICompatibleAdapter({ fetchFn: fetchFn as any });
    await expect(adapter.send(req)).rejects.toThrow(ProviderUnavailableError);
  });

  it("normalizes context length overflow to ContextWindowExceededError", async () => {
    const fetchFn = async () => new Response(JSON.stringify({ error: { message: "Maximum context length exceeded" } }), { status: 400 });
    const adapter = new OpenAICompatibleAdapter({ fetchFn: fetchFn as any });
    await expect(adapter.send(req)).rejects.toThrow(ContextWindowExceededError);
  });
});
