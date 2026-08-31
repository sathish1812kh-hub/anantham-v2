import { describe, it, expect } from "vitest";
import { HookExecutor } from "../../src/hooks/hook-executor.js";
import { type HookRecord } from "../../src/domain/hook.js";
import { ToolGateway } from "../../src/tools/tool-gateway.js";
import { ToolRegistry } from "../../src/tools/tool-registry.js";
import { PolicyEngine } from "../../src/policy/policy-engine.js";

describe("P5.4 Hooks — Timeouts, Retries & Bounded Execution", () => {
  it("enforces execution timeout and fails gracefully when action exceeds limit", async () => {
    const toolRegistry = new ToolRegistry();
    toolRegistry.register({
      definition: {
        name: "slow_tool",
        description: "Slow test tool",
        parametersSchema: { type: "object" },
        isIdempotent: true,
      },
      handler: async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return { ok: true };
      },
    });

    const policyEngine = new PolicyEngine();
    const toolGateway = new ToolGateway({
      registry: toolRegistry,
      policyEngine,
    });

    const executor = new HookExecutor({ toolGateway });

    const slowHook: HookRecord = {
      id: "slow-hook",
      manifest: {
        id: "slow-hook",
        name: "Slow Hook",
        version: "1.0.0",
        event: "BeforeCommand",
        action: { type: "tool", tool: "slow_tool" },
        policy: { onFailure: "warn", timeoutMs: 30, maxRetries: 0 },
        priority: 100,
        enabled: true,
        scope: "global",
      },
      lifecycleState: "enabled",
      source: "project",
      registeredAt: new Date().toISOString(),
    };

    const result = await executor.execute(slowHook, { event: "BeforeCommand" });
    expect(result.success).toBe(false);
    expect(result.decision).toBe("skipped");
    expect(result.error).toContain("timed out");
  });
});
