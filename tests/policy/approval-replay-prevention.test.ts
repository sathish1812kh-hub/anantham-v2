import { describe, it, expect, beforeEach } from "vitest";
import { ApprovalManager } from "../../src/policy/approval-manager.js";
import type { PolicyEvaluationContext } from "../../src/domain/policy.js";

describe("W-P10.6-01: Approval Replay Prevention", () => {
  let approvalManager: ApprovalManager;

  const validContext: PolicyEvaluationContext = {
    actor: { id: "agent_dev", type: "agent" },
    project: { id: "proj_secure" },
    session: { id: "sess_01" },
    task: { id: "task_del_01" },
    operation: {
      type: "tool_execution",
      toolName: "delete_file",
      arguments: { path: "critical_data.txt" },
    },
    dataSensitivity: "sensitive",
    requestedRiskLevel: "high",
  };

  beforeEach(() => {
    approvalManager = new ApprovalManager();
  });

  it("permits single consumption of an approved request and rejects subsequent replays", () => {
    const request = approvalManager.createApprovalRequest(validContext, "high");
    expect(request.status).toBe("pending");

    // Human operator grants approval
    const approved = approvalManager.grantApproval(request.approvalId, "operator_sathish");
    expect(approved.status).toBe("approved");

    // 1st Execution: Validated and consumed
    const firstConsumption = approvalManager.validateAndConsumeApproval(request.approvalId, validContext);
    expect(firstConsumption.valid).toBe(true);

    // Verify status transitioned to "consumed"
    const recordAfter = approvalManager.getApproval(request.approvalId);
    expect(recordAfter?.status).toBe("consumed");
    expect(recordAfter?.consumedAt).toBeDefined();

    // 2nd Execution (Replay Attack): MUST BE REJECTED
    const replayAttempt = approvalManager.validateAndConsumeApproval(request.approvalId, validContext);
    expect(replayAttempt.valid).toBe(false);
    expect(replayAttempt.reason).toContain("not in approved state");
  });
});
