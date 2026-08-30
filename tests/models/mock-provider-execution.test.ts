import { describe, it, expect } from "vitest";
import { MockProviderAdapter } from "../../src/models/mock-provider-adapter.js";

describe("MockProviderAdapter - Unary & Streaming Execution", () => {
  it("executes unary send() request and returns valid ModelResponse", async () => {
    const adapter = new MockProviderAdapter({
      defaultResponseText: "Task completed successfully with RPO 0 durability.",
    });

    const response = await adapter.send({
      modelId: "mock-model",
      messages: [{ role: "user", content: "Run verification" }],
    });

    expect(response.id).toBeDefined();
    expect(response.modelId).toBe("mock-model");
    expect(response.message.content).toContain("Task completed successfully");
    expect(response.finishReason).toBe("stop");
    expect(response.usage.totalTokens).toBeGreaterThan(0);
  });

  it("executes stream() request and yields streaming ModelStreamChunks", async () => {
    const adapter = new MockProviderAdapter({
      defaultResponseText: "Hello streaming world",
    });

    const chunks = [];
    for await (const chunk of adapter.stream({
      modelId: "mock-model",
      messages: [{ role: "user", content: "Hello" }],
    })) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(1);
    const accumulatedText = chunks
      .map((c) => c.deltaText || "")
      .join("");
    expect(accumulatedText).toContain("Hello streaming world");

    const finalChunk = chunks[chunks.length - 1];
    expect(finalChunk.finishReason).toBe("stop");
    expect(finalChunk.usage?.totalTokens).toBeGreaterThan(0);
  });
});
