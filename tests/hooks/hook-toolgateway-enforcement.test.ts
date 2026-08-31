import { describe, it, expect } from "vitest";
import { ToolGateway } from "../../src/tools/tool-gateway.js";
import { ToolRegistry } from "../../src/tools/tool-registry.js";
import { PolicyEngine } from "../../src/policy/policy-engine.js";
import { HookManager } from "../../src/hooks/hook-manager.js";
import { HookExecutor } from "../../src/hooks/hook-executor.js";

describe("P5.4 Hooks — ToolGateway & PolicyEngine Enforcement", () => {
  it("routes hook tool execution strictly through ToolGateway with policy verification", async () => {
    const toolRegistry = new ToolRegistry();
    let toolInvoked = false;

    toolRegistry.register({
      definition: {
        name: "audit.log",
        description: "Log audit record",
        parametersSchema: { type: "object", properties: { msg: { type: "string" } } },
        isIdempotent: true,
        riskLevel: "low",
      },
      handler: async (params) => {
        toolInvoked = true;
        return { logged: true, msg: params.msg };
      },
    });

    const policyEngine = new PolicyEngine();
    const toolGateway = new ToolGateway({
      registry: toolRegistry,
      policyEngine,
    });

    const executor = new HookExecutor({ toolGateway });
    const manager = new HookManager({ executor });

    manager.register({
      id: "audit-hook",
      name: "Audit Hook",
      version: "1.0.0",
      event: "AfterTool",
      action: {
        type: "tool",
        tool: "audit.log",
        parameters: { msg: "Tool executed successfully" },
      },
      policy: {
        onFailure: "warn",
      },
      priority: 100,
      enabled: true,
      scope: "global",
    });

    const result = await manager.handleEvent({
      event: "AfterTool",
    });

    expect(result.matchedCount).toBe(1);
    expect(result.results[0]?.success).toBe(true);
    expect(toolInvoked).toBe(true);
  });
});
