import { describe, it, expect } from "vitest";
import { ContextEngine } from "../../src/context/context-engine.js";
import { ToolResultPruner } from "../../src/context/tool-result-pruner.js";

describe("ContextEngine - Token Accounting and Tool Result Pruning", () => {
  it("prunes oversized tool results and preserves error traces", () => {
    const rawLargeOutput = "Normal output line 1\n".repeat(200) +
      "TypeError: Invalid property 'db' on undefined\n" +
      "Normal output line 2\n".repeat(200);

    const result = ToolResultPruner.prune(rawLargeOutput, {
      maxChars: 1000,
      artifactRefUri: "artifact://art_log_01",
    });

    expect(result.wasPruned).toBe(true);
    expect(result.content).toContain("[TRUNCATED:");
    expect(result.content).toContain("TypeError: Invalid property 'db' on undefined");
    expect(result.content).toContain("artifact://art_log_01");
  });

  it("accounts for tool schemas and tool results in assembled ContextPlan", async () => {
    const plan = await ContextEngine.assembleContext({
      sessionId: "ses_01",
      projectId: "prj_01",
      modelProfile: {
        modelId: "gpt-4o",
        supportedModalities: ["text"],
      },
      toolSchemas: [
        {
          name: "execute_cypher",
          schema: { type: "object", properties: { query: { type: "string" } } },
        },
      ],
      toolResults: [
        {
          toolName: "execute_cypher",
          rawOutput: "RETURN 1; Success. 3,034 nodes matched.",
        },
      ],
      candidates: [],
    });

    expect(plan.items.some((i) => i.sourceType === "tool-schema")).toBe(true);
    expect(plan.items.some((i) => i.authority === "tool-output")).toBe(true);
    expect(plan.estimatedTokens).toBeGreaterThan(0);
  });
});
