import { describe, it, expect } from "vitest";
import { DelegationGuard } from "../../src/agents/delegation-guard.js";
import { ApprovalManager } from "../../src/policy/approval-manager.js";
import { AgentRuntimeState, AgentStartupPlan } from "../../src/domain/agent.js";
import { DelegationRequest } from "../../src/domain/team.js";

describe("P9.3 Security — Permission Escalation & Approval TOCTOU Hardening", () => {
  it("enforces subagent delegation permission ceiling preventing privilege escalation", () => {
    const guard = new DelegationGuard();

    const parentInstance: AgentRuntimeState = {
      instanceId: "inst_parent_01",
      agentId: "agent_parent",
      status: "running",
      activeTasks: [],
      allocatedTokens: 1000,
      startedAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
    };

    const parentPlan: AgentStartupPlan = {
      agentId: "agent_parent",
      instanceId: "inst_parent_01",
      role: "orchestrator",
      systemPrompt: "You are the parent orchestrator.",
      grantedPermissions: ["fs.read", "crypto.hash"],
      budget: { maxTokens: 50000, maxCostUsd: 2.0 },
      metadata: { delegationDepth: 0 },
    };

    // Subagent attempting to acquire unauthorized write tool
    const escalatedRequest: DelegationRequest = {
      targetAgentId: "subagent_writer",
      task: "write malicious code",
      requestedPermissions: ["fs.read", "fs.write"], // Escalation!
      allocatedBudget: { maxTokens: 10000, maxCostUsd: 0.5 },
    };

    const validation = guard.validateDelegation(parentInstance, parentPlan, escalatedRequest, 0);
    expect(validation.valid).toBe(false);
    expect(validation.errorCode).toBe("PRIVILEGE_ESCALATION_BLOCKED");
  });

  it("invalidates expired approvals preventing Time-of-Check to Time-of-Use (TOCTOU) replay", async () => {
    const approvalManager = new ApprovalManager({ defaultTtlMs: 5 }); // 5ms TTL

    const context = {
      actor: { id: "agent_01", type: "agent" as const },
      project: { id: "proj_01", trustProfile: "safe" as const },
      operation: {
        type: "file_delete",
        toolName: "delete_file",
        resource: "/var/data/important.db",
        arguments: { path: "/var/data/important.db" },
      },
    };

    const approval = approvalManager.createApprovalRequest(context, "high", "fs.delete", 5);

    // Wait 25ms to ensure expiration
    await new Promise((resolve) => setTimeout(resolve, 25));

    // Attempting to grant expired approval must throw expiration error
    expect(() => {
      approvalManager.grantApproval(approval.approvalId, "admin", { reason: "Approved too late" });
    }).toThrow(/expired/);

    const record = approvalManager.getApproval(approval.approvalId);
    expect(record?.status).toBe("expired");
  });
});

