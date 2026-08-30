import { describe, it, expect } from "vitest";
import { OpenAICompatibleAdapter } from "../../src/models/adapters/openai-compatible-adapter.js";
import { AnthropicCompatibleAdapter } from "../../src/models/adapters/anthropic-compatible-adapter.js";
import { GeminiProviderAdapter } from "../../src/models/adapters/gemini-adapter.js";

describe("Cross-Provider Tool Calling Normalization", () => {
  it("translates generic ToolDefinition into provider payloads and parses tool calls into ToolCallSchema", async () => {
    // 1. OpenAI test
    const openAiFetch = async (_url: any, options: any) => {
      const body = JSON.parse(options.body);
      expect(body.tools[0].function.name).toBe("search_docs");

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    id: "call_oa_1",
                    function: { name: "search_docs", arguments: "{\"query\":\"test\"}" },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        }),
        { status: 200 }
      );
    };

    const oaAdapter = new OpenAICompatibleAdapter({ fetchFn: openAiFetch as any });
    const oaRes = await oaAdapter.send({
      modelId: "gpt-4o",
      messages: [{ role: "user", content: "search docs" }],
      tools: [{ name: "search_docs", parameters: { type: "object" } }],
    });

    expect(oaRes.message.toolCalls?.[0].name).toBe("search_docs");
    expect(oaRes.message.toolCalls?.[0].argumentsJson).toBe("{\"query\":\"test\"}");

    // 2. Anthropic test
    const antFetch = async (_url: any, options: any) => {
      const body = JSON.parse(options.body);
      expect(body.tools[0].name).toBe("search_docs");

      return new Response(
        JSON.stringify({
          content: [
            {
              type: "tool_use",
              id: "call_ant_1",
              name: "search_docs",
              input: { query: "test" },
            },
          ],
          stop_reason: "tool_use",
        }),
        { status: 200 }
      );
    };

    const antAdapter = new AnthropicCompatibleAdapter({ fetchFn: antFetch as any });
    const antRes = await antAdapter.send({
      modelId: "claude-3-5-sonnet",
      messages: [{ role: "user", content: "search docs" }],
      tools: [{ name: "search_docs", parameters: { type: "object" } }],
    });

    expect(antRes.message.toolCalls?.[0].name).toBe("search_docs");
    expect(antRes.message.toolCalls?.[0].argumentsJson).toBe("{\"query\":\"test\"}");

    // 3. Gemini test
    const gemFetch = async (_url: any, options: any) => {
      const body = JSON.parse(options.body);
      expect(body.tools[0].functionDeclarations[0].name).toBe("search_docs");

      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: { name: "search_docs", args: { query: "test" } },
                  },
                ],
              },
              finishReason: "STOP",
            },
          ],
        }),
        { status: 200 }
      );
    };

    const gemAdapter = new GeminiProviderAdapter({ fetchFn: gemFetch as any });
    const gemRes = await gemAdapter.send({
      modelId: "gemini-1.5-pro",
      messages: [{ role: "user", content: "search docs" }],
      tools: [{ name: "search_docs", parameters: { type: "object" } }],
    });

    expect(gemRes.message.toolCalls?.[0].name).toBe("search_docs");
    expect(gemRes.message.toolCalls?.[0].argumentsJson).toBe("{\"query\":\"test\"}");
  });
});
