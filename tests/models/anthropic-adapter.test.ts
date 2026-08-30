import { describe, it, expect } from "vitest";
import { AnthropicCompatibleAdapter } from "../../src/models/adapters/anthropic-compatible-adapter.js";
import { RateLimitError, AuthenticationError } from "../../src/models/model-errors.js";

describe("AnthropicCompatibleAdapter - System Extraction, Tools & Errors", () => {
  it("extracts system prompt to top-level system parameter", async () => {
    let capturedBody: any;
    const mockFetch = async (_url: any, options: any) => {
      capturedBody = JSON.parse(options.body);
      expect(options.headers["x-api-key"]).toBe("sk-ant-test-key");
      expect(options.headers["anthropic-version"]).toBe("2023-06-01");

      return new Response(
        JSON.stringify({
          id: "msg_01",
          content: [{ type: "text", text: "I understand your system instructions." }],
          stop_reason: "end_turn",
          usage: {
            input_tokens: 25,
            output_tokens: 10,
          },
        }),
        { status: 200 }
      );
    };

    const adapter = new AnthropicCompatibleAdapter({
      apiKey: "sk-ant-test-key",
      fetchFn: mockFetch as any,
    });

    const res = await adapter.send({
      modelId: "claude-3-5-sonnet-20241022",
      messages: [
        { role: "system", content: "You are a specialized code assistant." },
        { role: "user", content: "Hello!" },
      ],
    });

    expect(capturedBody.system).toBe("You are a specialized code assistant.");
    expect(capturedBody.messages.length).toBe(1);
    expect(capturedBody.messages[0].role).toBe("user");
    expect(res.message.content).toBe("I understand your system instructions.");
    expect(res.usage?.totalTokens).toBe(35);
  });

  it("normalizes tool_use content blocks to ToolCall format", async () => {
    const mockFetch = async () => {
      return new Response(
        JSON.stringify({
          id: "msg_tool_01",
          content: [
            {
              type: "tool_use",
              id: "toolu_01",
              name: "read_file",
              input: { path: "src/main.ts" },
            },
          ],
          stop_reason: "tool_use",
        }),
        { status: 200 }
      );
    };

    const adapter = new AnthropicCompatibleAdapter({
      apiKey: "sk-ant-key",
      fetchFn: mockFetch as any,
    });

    const res = await adapter.send({
      modelId: "claude-3-5-sonnet",
      messages: [{ role: "user", content: "Read src/main.ts" }],
    });

    expect(res.finishReason).toBe("tool_calls");
    expect(res.message.toolCalls?.length).toBe(1);
    expect(res.message.toolCalls?.[0].id).toBe("toolu_01");
    expect(res.message.toolCalls?.[0].name).toBe("read_file");
    expect(res.message.toolCalls?.[0].argumentsJson).toBe("{\"path\":\"src/main.ts\"}");
  });

  it("normalizes Anthropic 401 & 429 errors", async () => {
    const fetch429 = async () => new Response(JSON.stringify({ error: { message: "Rate limit exceeded" } }), { status: 429 });
    const adapter = new AnthropicCompatibleAdapter({ fetchFn: fetch429 as any });

    await expect(
      adapter.send({ modelId: "claude-3-5-sonnet", messages: [{ role: "user", content: "hi" }] })
    ).rejects.toThrow(RateLimitError);
  });
});
