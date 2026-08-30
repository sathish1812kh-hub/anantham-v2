import { describe, it, expect } from "vitest";
import { ToolGateway } from "../../src/tools/tool-gateway.js";
import { ToolRegistry } from "../../src/tools/tool-registry.js";

describe("P4.2 Tool Gateway — Execution Timeout & Cancellation", () => {
  it("terminates tool execution exceeding timeout window and returns TIMEOUT status", async () => {
    const registry = new ToolRegistry();

    registry.register({
      definition: {
        name: "slow_tool",
        parametersSchema: {},
        isIdempotent: false,
        timeoutMs: 50, // 50ms timeout
      },
      handler: async (_args, context) => {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve("late_result"), 200);
          context.signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new Error("Aborted by gateway"));
          });
        });
      },
    });

    const gateway = new ToolGateway({ registry, defaultTimeoutMs: 50 });
    const obs = await gateway.invoke({
      callId: "call_timeout_1",
      toolName: "slow_tool",
      arguments: {},
      actor: { id: "agent_dev", type: "agent" },
      project: { id: "prj_main" },
    });

    expect(obs.status).toBe("timeout");
    expect(obs.error?.code).toBe("TIMEOUT");
    expect(obs.error?.message).toContain("timed out after 50ms");
  });
});
