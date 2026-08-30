import { describe, it, expect } from "vitest";
import { ApprovalManager } from "../../src/policy/approval-manager.js";
import type { PolicyEvaluationContext } from "../../src/domain/policy.js";

describe("P4.1 Approval Lifecycle & TOCTOU Cryptographic Binding", () => {
  it("creates, grants, and revalidates approval successfully with matching arguments", () => {
    const manager = new ApprovalManager();

    const context: PolicyEvaluationContext = {
      actor: { id: "agent_executor", type: "agent" },
      project: { id: "prj_main" },
      operation: {
        type: "tool_execution",
        toolName: "run_command",
        arguments: { command: "git push origin main" },
      },
    };

    // 1. Create approval request
    const record = manager.createApprovalRequest(context, "high");
    expect(record.status).toBe("pending");
    expect(record.argumentsDigest).toBeDefined();

    // 2. Human grants approval
    const granted = manager.grantApproval(record.approvalId, "user_admin", { reason: "Code reviewed" });
    expect(granted.status).toBe("approved");
    expect(granted.decidedBy).toBe("user_admin");

    // 3. Execution boundary revalidation succeeds
    const reval = manager.validateAndConsumeApproval(record.approvalId, context);
    expect(reval.valid).toBe(true);
  });

  it("TOCTOU DEFENSE: Rejects execution if arguments are tampered post-approval", () => {
    const manager = new ApprovalManager();

    const originalContext: PolicyEvaluationContext = {
      actor: { id: "agent_executor", type: "agent" },
      project: { id: "prj_main" },
      operation: {
        type: "tool_execution",
        toolName: "run_command",
        arguments: { command: "npm run build" },
      },
    };

    const record = manager.createApprovalRequest(originalContext, "high");
    manager.grantApproval(record.approvalId, "user_admin");

    // Adversary / bug mutates command to dangerous operation before execution
    const tamperedContext: PolicyEvaluationContext = {
      ...originalContext,
      operation: {
        type: "tool_execution",
        toolName: "run_command",
        arguments: { command: "rm -rf /" },
      },
    };

    const reval = manager.validateAndConsumeApproval(record.approvalId, tamperedContext);
    expect(reval.valid).toBe(false);
    expect(reval.reason).toContain("TOCTOU violation detected");
  });
});
