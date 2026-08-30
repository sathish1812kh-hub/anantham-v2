import { describe, it, expect } from "vitest";
import { OpenAICompatibleAdapter } from "../../src/models/adapters/openai-compatible-adapter.js";
import { InMemorySecretStore } from "../../src/models/secret-store.js";
import { RateLimitError, AuthenticationError, ProviderUnavailableError } from "../../src/models/model-errors.js";

describe("OpenAICompatibleAdapter - Unary, Tool Calling & Error Mapping", () => {
  it("executes unary request and normalizes text response and token usage", async () => {
    const mockFetch = async (_url: any, options: any) => {
      const body = JSON.parse(options.body);
      expect(body.model).toBe("gpt-4o");
      expect(options.headers["Authorization"]).toBe("Bearer sk-test-key-1234");

      return new Response(
        JSON.stringify({
          id: "chatcmpl_01",
          choices: [
            {
              message: { role: "assistant", content: "Hello from OpenAI compatible endpoint!" },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 15,
            completion_tokens: 8,
            total_tokens: 23,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const adapter = new OpenAICompatibleAdapter({
      providerId: "openai",
      apiKey: "sk-test-key-1234",
      fetchFn: mockFetch as any,
    });

    const res = await adapter.send({
      modelId: "gpt-4o",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(res.message.content).toBe("Hello from OpenAI compatible endpoint!");
    expect(res.finishReason).toBe("stop");
    expect(res.usage?.totalTokens).toBe(23);
  });

  it("normalizes tool calls in assistant response", async () => {
    const mockFetch = async () => {
      return new Response(
        JSON.stringify({
          id: "chatcmpl_tool_01",
          choices: [
            {
              message: {
                role: "assistant",
                content: "",
                tool_calls: [
                  {
                    id: "call_abc123",
                    type: "function",
                    function: {
                      name: "get_weather",
                      arguments: "{\"city\":\"San Francisco\"}",
                    },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const adapter = new OpenAICompatibleAdapter({
      providerId: "deepseek",
      apiKey: "sk-deepseek-key",
      fetchFn: mockFetch as any,
    });

    const res = await adapter.send({
      modelId: "deepseek-chat",
      messages: [{ role: "user", content: "What is the weather in SF?" }],
    });

    expect(res.finishReason).toBe("tool_calls");
    expect(res.message.toolCalls?.length).toBe(1);
    expect(res.message.toolCalls?.[0].name).toBe("get_weather");
    expect(res.message.toolCalls?.[0].argumentsJson).toBe("{\"city\":\"San Francisco\"}");
  });

  it("normalizes HTTP 401, 429, 503 errors into typed ModelErrors", async () => {
    // 401
    const fetch401 = async () => new Response(JSON.stringify({ error: { message: "Invalid API key" } }), { status: 401 });
    const adapter401 = new OpenAICompatibleAdapter({ fetchFn: fetch401 as any });
    await expect(adapter401.send({ modelId: "gpt-4o", messages: [{ role: "user", content: "hi" }] })).rejects.toThrow(AuthenticationError);

    // 429
    const fetch429 = async () => new Response(JSON.stringify({ error: { message: "Rate limit exceeded" } }), { status: 429 });
    const adapter429 = new OpenAICompatibleAdapter({ fetchFn: fetch429 as any });
    await expect(adapter429.send({ modelId: "gpt-4o", messages: [{ role: "user", content: "hi" }] })).rejects.toThrow(RateLimitError);

    // 503
    const fetch503 = async () => new Response(JSON.stringify({ error: { message: "Service Unavailable" } }), { status: 503 });
    const adapter503 = new OpenAICompatibleAdapter({ fetchFn: fetch503 as any });
    await expect(adapter503.send({ modelId: "gpt-4o", messages: [{ role: "user", content: "hi" }] })).rejects.toThrow(ProviderUnavailableError);
  });

  it("retrieves API key from SecretStore at dispatch boundary", async () => {
    const secretStore = new InMemorySecretStore();
    await secretStore.setSecret("cred_openai_secure", "sk-secret-from-store");

    let authHeader = "";
    const mockFetch = async (_url: any, options: any) => {
      authHeader = options.headers["Authorization"];
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "OK" } }],
        }),
        { status: 200 }
      );
    };

    const adapter = new OpenAICompatibleAdapter({
      secretStore,
      credentialId: "cred_openai_secure",
      fetchFn: mockFetch as any,
    });

    await adapter.send({ modelId: "gpt-4o", messages: [{ role: "user", content: "hi" }] });
    expect(authHeader).toBe("Bearer sk-secret-from-store");
  });
});
