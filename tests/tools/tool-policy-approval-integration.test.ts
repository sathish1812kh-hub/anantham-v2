import { describe, it, expect } from "vitest";
import { ToolGateway } from "../../src/tools/tool-gateway.js";
import { ToolRegistry } from "../../src/tools/tool-registry.js";
import { PolicyEngine } from "../../src/policy/policy-engine.js";
import { ApprovalManager } from "../../src/policy/approval-manager.js";

describe("P4.2 Tool Gateway — Policy & Approval Gate Integration", () => {
  it("denies tool execution immediately when PolicyEngine rejects operation", async () => {
    const registry = new ToolRegistry();
    let executed = false;

    registry.register({
      definition: {
        name: "forbidden_tool",
        parametersSchema: {},
        isIdempotent: false,
      },
      handler: async () => {
        executed = true;
        return "done";
      },
    });

    const policyEngine = new PolicyEngine({
      rules: [
        {
          ruleId: "deny_forbidden",
          name: "Strict Denial",
          priority: 100,
          scope: { toolName: "forbidden_tool" },
          effect: "deny",
          riskLevel: "high",
          reason: "Forbidden by policy",
        },
      ],
    });

    const gateway = new ToolGateway({ registry, policyEngine });
    const obs = await gateway.invoke({
      callId: "call_deny",
      toolName: "forbidden_tool",
      arguments: {},
      actor: { id: "agent_dev", type: "agent" },
      project: { id: "prj_test" },
    });

    expect(executed).toBe(false);
    expect(obs.status).toBe("denied");
    expect(obs.error?.code).toBe("POLICY_DENIED");
  });

  it("requires approval on HIGH risk tool, generates approval request, and executes after approval grant", async () => {
    const registry = new ToolRegistry();
    let executionCount = 0;

    registry.register({
      definition: {
        name: "run_shell_cmd",
        parametersSchema: { properties: { cmd: { type: "string" } } },
        isIdempotent: false,
        riskLevel: "high",
      },
      handler: async (args) => {
        executionCount++;
        return `Ran: ${args.cmd}`;
      },
    });

    const policyEngine = new PolicyEngine();
    const approvalManager = new ApprovalManager();
    const gateway = new ToolGateway({ registry, policyEngine, approvalManager });

    // Step 1: Initial call without approvalId -> returns approval_required
    const obs1 = await gateway.invoke({
      callId: "call_req_app",
      toolName: "run_shell_cmd",
      arguments: { cmd: "npm install" },
      actor: { id: "agent_coder", type: "agent" },
      project: { id: "prj_test" },
    });

    expect(executionCount).toBe(0);
    expect(obs1.status).toBe("approval_required");
    expect(obs1.approvalId).toBeDefined();

    const approvalId = obs1.approvalId!;

    // Step 2: Human operator grants approval
    approvalManager.grantApproval(approvalId, "user_admin");

    // Step 3: Second call with valid approvalId -> executes handler
    const obs2 = await gateway.invoke({
      callId: "call_exec_app",
      toolName: "run_shell_cmd",
      arguments: { cmd: "npm install" },
      actor: { id: "agent_coder", type: "agent" },
      project: { id: "prj_test" },
      approvalId,
    });

    expect(executionCount).toBe(1);
    expect(obs2.status).toBe("success");
    expect(obs2.result).toBe("Ran: npm install");
  });
});
