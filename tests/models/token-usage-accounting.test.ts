import { describe, it, expect } from "vitest";
import { MockProviderAdapter } from "../../src/models/mock-provider-adapter.js";

describe("ModelAdapter - Token Usage & Cost Accounting", () => {
  it("records prompt, completion, total tokens and optional cost", async () => {
    const adapter = new MockProviderAdapter({
      defaultResponseText: "Detailed response with token accounting.",
    });

    const response = await adapter.send({
      modelId: "gpt-4o",
      messages: [
        { role: "system", content: "You are Anantham Orchestrator." },
        { role: "user", content: "Account for tokens accurately." },
      ],
    });

    expect(response.usage).toBeDefined();
    expect(response.usage.promptTokens).toBeGreaterThan(0);
    expect(response.usage.completionTokens).toBeGreaterThan(0);
    expect(response.usage.totalTokens).toBe(
      response.usage.promptTokens + response.usage.completionTokens
    );
    expect(response.usage.costUsd).toBeDefined();
  });
});
