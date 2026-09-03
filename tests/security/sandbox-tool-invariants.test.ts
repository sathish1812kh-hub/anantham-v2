import { describe, it, expect } from "vitest";
import { ToolGatewayOrchestrator } from "../../src/execution/tool-gateway-orchestrator.js";
import type { ToolExecutionRequest } from "../../src/execution/types.js";

describe("PRD-INV-004: Sandbox Isolation & Tool Integrity Invariants", () => {
  it("enforces that agents never execute tools directly and blocked tools cannot execute under any circumstance", async () => {
    const gateway = new ToolGatewayOrchestrator({
      policy: {
        blockedTools: ["format_drive", "execute_untrusted_binary"],
        maxRiskLevelWithoutApproval: "execute",
      },
    });

    const blockedReq: ToolExecutionRequest = {
      id: "req_blocked",
      toolName: "format_drive",
      action: "Formatting",
      arguments: {},
      sessionId: "sess_inv",
      agentId: "agent_malicious",
      workspaceRoot: "/workspace",
    };

    let executorCalled = false;
    const result = await gateway.executeTool(
      blockedReq,
      async () => {
        executorCalled = true;
        return { formatted: true };
      },
      true // Even if approved!
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("explicitly blocked by ToolGateway policy");
    expect(executorCalled).toBe(false);
  });
});
