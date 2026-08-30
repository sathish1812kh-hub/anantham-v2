import { describe, it, expect } from "vitest";
import { OpenAICompatibleAdapter } from "../../src/models/adapters/openai-compatible-adapter.js";
import { AnthropicCompatibleAdapter } from "../../src/models/adapters/anthropic-compatible-adapter.js";

function createReadableStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

describe("Cross-Provider Streaming Normalization", () => {
  it("normalizes SSE chunks from OpenAI-compatible provider", async () => {
    const sseLines = [
      "data: {\"choices\":[{\"delta\":{\"content\":\"Hello \"}}]}\n\n",
      "data: {\"choices\":[{\"delta\":{\"content\":\"world!\"},\"finish_reason\":\"stop\"}],\"usage\":{\"total_tokens\":5}}\n\n",
      "data: [DONE]\n\n",
    ];

    const mockFetch = async () => new Response(createReadableStream(sseLines), { status: 200 });

    const adapter = new OpenAICompatibleAdapter({ fetchFn: mockFetch as any });
    const chunks: string[] = [];

    for await (const chunk of adapter.stream({ modelId: "gpt-4o", messages: [{ role: "user", content: "hi" }] })) {
      if (chunk.deltaText) {
        chunks.push(chunk.deltaText);
      }
    }

    expect(chunks.join("")).toBe("Hello world!");
  });

  it("normalizes SSE chunks from Anthropic provider", async () => {
    const sseLines = [
      "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"Claude \"}}\n\n",
      "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"streamed!\"}}\n\n",
      "data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{\"output_tokens\":6}}\n\n",
    ];

    const mockFetch = async () => new Response(createReadableStream(sseLines), { status: 200 });

    const adapter = new AnthropicCompatibleAdapter({ fetchFn: mockFetch as any });
    const chunks: string[] = [];

    for await (const chunk of adapter.stream({ modelId: "claude-3-5-sonnet", messages: [{ role: "user", content: "hi" }] })) {
      if (chunk.deltaText) {
        chunks.push(chunk.deltaText);
      }
    }

    expect(chunks.join("")).toBe("Claude streamed!");
  });
});
