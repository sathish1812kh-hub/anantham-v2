import { describe, it, expect } from "vitest";
import {
  ModelRequestSchema,
  ModelResponseSchema,
  ModelStreamChunkSchema,
  ToolDefinitionSchema,
} from "../../src/domain/model.js";

describe("Model Domain Contracts - Schema Validation", () => {
  it("validates valid ModelRequestSchema", () => {
    const validReq = {
      modelId: "claude-3-5-sonnet",
      messages: [
        { role: "system" as const, content: "System instructions" },
        { role: "user" as const, content: "Hello world" },
      ],
      temperature: 0.7,
      maxTokens: 4096,
      stream: false,
    };

    const parsed = ModelRequestSchema.parse(validReq);
    expect(parsed.modelId).toBe("claude-3-5-sonnet");
    expect(parsed.messages.length).toBe(2);
  });

  it("validates valid ToolDefinitionSchema", () => {
    const validTool = {
      name: "search_codebase",
      description: "Search symbols in CodeGraph",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
      },
    };

    const parsed = ToolDefinitionSchema.parse(validTool);
    expect(parsed.name).toBe("search_codebase");
  });

  it("validates ModelResponseSchema with usage and finishReason", () => {
    const validResp = {
      id: "resp_123",
      modelId: "gpt-4o",
      message: {
        role: "assistant" as const,
        content: "Here is your response.",
      },
      finishReason: "stop" as const,
      usage: {
        promptTokens: 100,
        completionTokens: 25,
        totalTokens: 125,
        costUsd: 0.0003,
      },
      createdAt: new Date().toISOString(),
    };

    const parsed = ModelResponseSchema.parse(validResp);
    expect(parsed.finishReason).toBe("stop");
    expect(parsed.usage.totalTokens).toBe(125);
  });

  it("validates ModelStreamChunkSchema", () => {
    const validChunk = {
      id: "chunk_01",
      modelId: "gemini-1.5-pro",
      deltaText: "Partial response token",
    };

    const parsed = ModelStreamChunkSchema.parse(validChunk);
    expect(parsed.deltaText).toBe("Partial response token");
  });
});
