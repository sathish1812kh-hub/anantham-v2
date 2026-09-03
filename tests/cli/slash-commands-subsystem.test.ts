import { describe, it, expect } from "vitest";
import { SlashCommandsRegistry } from "../../src/cli/slash-commands-registry.js";

describe("PRD-CLI-003: Slash Commands Subsystem", () => {
  const registry = new SlashCommandsRegistry();

  it("lists and executes default built-in commands: /help, /clear, /model, /session, /cost", async () => {
    // 1. /help
    const helpRes = await registry.execute("/help", []);
    expect(helpRes.success).toBe(true);
    expect(helpRes.message).toContain("/model");
    expect(helpRes.message).toContain("/cost");

    // 2. /model
    const modelRes = await registry.execute("/model", ["claude-3-5-sonnet"]);
    expect(modelRes.success).toBe(true);
    expect(modelRes.message).toContain("claude-3-5-sonnet");

    // 3. /session
    const sessRes = await registry.execute("/session", ["sess_test_123"]);
    expect(sessRes.success).toBe(true);
    expect(sessRes.message).toContain("sess_test_123");

    // 4. /cost
    const costRes = await registry.execute("/cost", [], { totalTokens: 12500, totalCostUsd: 0.0375 });
    expect(costRes.success).toBe(true);
    expect(costRes.message).toContain("12,500");
    expect(costRes.message).toContain("$0.0375");

    // 5. Unknown command
    const unknownRes = await registry.execute("/unknown", []);
    expect(unknownRes.success).toBe(false);
    expect(unknownRes.message).toContain("Unknown slash command");
  });
});
