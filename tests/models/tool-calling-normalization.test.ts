import { describe, it, expect } from "vitest";
import { MockProviderAdapter } from "../../src/models/mock-provider-adapter.js";

describe("ModelAdapter - Tool Calling Normalization", () => {
  it("normalizes tool call output with argumentsJson and finishReason=tool_calls", async () => {
    const adapter = new MockProviderAdapter();

    const response = await adapter.send({
      modelId: "gpt-4o",
      messages: [{ role: "user", content: "Please run tool search_codebase" }],
      tools: [
        {
          name: "search_codebase",
          description: "Search symbols in CodeGraph",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string" },
            },
          },
        },
      ],
    });

    expect(response.finishReason).toBe("tool_calls");
    expect(response.message.toolCalls).toBeDefined();
    expect(response.message.toolCalls?.length).toBe(1);

    const toolCall = response.message.toolCalls![0];
    expect(toolCall.name).toBe("search_codebase");
    expect(toolCall.id).toBeDefined();

    const parsedArgs = JSON.parse(toolCall.argumentsJson);
    expect(parsedArgs.query).toBeDefined();
  });
});
