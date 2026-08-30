import { describe, it, expect } from "vitest";
import { ToolGateway } from "../../src/tools/tool-gateway.js";
import { ToolRegistry } from "../../src/tools/tool-registry.js";
import { PolicyEngine } from "../../src/policy/policy-engine.js";
import { ApprovalManager } from "../../src/policy/approval-manager.js";

describe("P4.2 Tool Gateway — Adversarial Security Boundary", () => {
  it("rejects forged or non-existent approvalId", async () => {
    const registry = new ToolRegistry();
    let handlerRun = false;

    registry.register({
      definition: {
        name: "high_risk_tool",
        parametersSchema: {},
        isIdempotent: false,
        riskLevel: "high",
      },
      handler: async () => {
        handlerRun = true;
        return "pwned";
      },
    });

    const policyEngine = new PolicyEngine();
    const approvalManager = new ApprovalManager();
    const gateway = new ToolGateway({ registry, policyEngine, approvalManager });

    const obs = await gateway.invoke({
      callId: "call_fake_app",
      toolName: "high_risk_tool",
      arguments: {},
      actor: { id: "agent_attacker", type: "agent" },
      project: { id: "prj_main" },
      approvalId: "app_fake_nonexistent_id",
    });

    expect(handlerRun).toBe(false);
    expect(obs.status).toBe("denied");
    expect(obs.error?.code).toBe("APPROVAL_INVALID");
    expect(obs.error?.message).toContain("does not exist");
  });

  it("rejects execution if arguments are tampered post-approval (TOCTOU defense in Gateway)", async () => {
    const registry = new ToolRegistry();
    let handlerRun = false;

    registry.register({
      definition: {
        name: "deploy_tool",
        parametersSchema: { properties: { target: { type: "string" } } },
        isIdempotent: false,
        riskLevel: "high",
      },
      handler: async () => {
        handlerRun = true;
        return "deployed";
      },
    });

    const policyEngine = new PolicyEngine();
    const approvalManager = new ApprovalManager();
    const gateway = new ToolGateway({ registry, policyEngine, approvalManager });

    // Step 1: Request approval for staging
    const obs1 = await gateway.invoke({
      callId: "call_orig",
      toolName: "deploy_tool",
      arguments: { target: "staging" },
      actor: { id: "agent_dev", type: "agent" },
      project: { id: "prj_main" },
    });

    const approvalId = obs1.approvalId!;
    approvalManager.grantApproval(approvalId, "user_admin");

    // Step 2: Adversary tries to use the staging approval token for production
    const obs2 = await gateway.invoke({
      callId: "call_tamper",
      toolName: "deploy_tool",
      arguments: { target: "production" }, // Mutated!
      actor: { id: "agent_dev", type: "agent" },
      project: { id: "prj_main" },
      approvalId,
    });

    expect(handlerRun).toBe(false);
    expect(obs2.status).toBe("denied");
    expect(obs2.error?.code).toBe("APPROVAL_INVALID");
    expect(obs2.error?.message).toContain("TOCTOU violation detected");
  });
});
