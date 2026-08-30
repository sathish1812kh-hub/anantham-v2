import { describe, it, expect } from "vitest";
import { ToolGateway } from "../../src/tools/tool-gateway.js";
import { ToolRegistry } from "../../src/tools/tool-registry.js";

describe("P4.2 Tool Gateway — Error Normalization & Zero Secret Leakage", () => {
  it("normalizes handler crash into structured EXECUTOR_ERROR and masks raw credentials", async () => {
    const registry = new ToolRegistry();

    registry.register({
      definition: {
        name: "failing_network_tool",
        parametersSchema: {},
        isIdempotent: false,
      },
      handler: async () => {
        throw new Error("Connection failed with token: sk-live-supersecrettoken123456789");
      },
    });

    const gateway = new ToolGateway({ registry });
    const obs = await gateway.invoke({
      callId: "call_err_leak",
      toolName: "failing_network_tool",
      arguments: {},
      actor: { id: "agent_dev", type: "agent" },
      project: { id: "prj_main" },
    });

    expect(obs.status).toBe("failure");
    expect(obs.error?.code).toBe("EXECUTOR_ERROR");
    // Raw secret must be masked!
    expect(obs.error?.message).not.toContain("sk-live-supersecrettoken123456789");
    expect(obs.error?.message).toContain("[REDACTED_SECRET]");
  });
});
