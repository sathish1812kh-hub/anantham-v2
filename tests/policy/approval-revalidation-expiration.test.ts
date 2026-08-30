import { describe, it, expect } from "vitest";
import { ApprovalManager } from "../../src/policy/approval-manager.js";
import type { PolicyEvaluationContext } from "../../src/domain/policy.js";

describe("P4.1 Approval Revalidation — Expiration, Rejection & Policy Drift", () => {
  const context: PolicyEvaluationContext = {
    actor: { id: "agent_dev", type: "agent" },
    project: { id: "prj_core" },
    operation: {
      type: "tool_execution",
      toolName: "deploy_service",
      arguments: { env: "production" },
    },
  };

  it("rejects approval correctly and blocks execution", () => {
    const manager = new ApprovalManager();
    const req = manager.createApprovalRequest(context, "critical");

    const rejected = manager.rejectApproval(req.approvalId, "user_secops", { reason: "Deployment window closed" });
    expect(rejected.status).toBe("rejected");

    const reval = manager.validateAndConsumeApproval(req.approvalId, context);
    expect(reval.valid).toBe(false);
    expect(reval.reason).toContain('is not in approved state (status: "rejected")');
  });

  it("detects TTL expiration and invalidates approval", () => {
    const manager = new ApprovalManager();
    // Set already-expired timestamp
    const req = manager.createApprovalRequest(context, "high", {
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    // Attempting to grant expired approval fails
    expect(() => manager.grantApproval(req.approvalId, "user_admin")).toThrow("has expired");
  });

  it("detects policy version drift and requires re-approval", () => {
    const manager = new ApprovalManager();
    const req = manager.createApprovalRequest(context, "high", { policyVersion: "1.0.0" });
    manager.grantApproval(req.approvalId, "user_admin");

    // Active policy changes from 1.0.0 to 1.1.0 before execution
    const reval = manager.validateAndConsumeApproval(req.approvalId, context, "1.1.0");
    expect(reval.valid).toBe(false);
    expect(reval.reason).toContain("Policy version drift detected");
  });
});
