import { describe, it, expect } from "vitest";
import {
  RiskLevelSchema,
  PolicyRuleSchema,
  PolicyEvaluationContextSchema,
  PolicyDecisionSchema,
  ApprovalRecordSchema,
} from "../../src/domain/policy.js";

describe("P4.1 Policy Domain Contracts Validation", () => {
  it("validates RiskLevelSchema correctly", () => {
    expect(RiskLevelSchema.safeParse("low").success).toBe(true);
    expect(RiskLevelSchema.safeParse("medium").success).toBe(true);
    expect(RiskLevelSchema.safeParse("high").success).toBe(true);
    expect(RiskLevelSchema.safeParse("critical").success).toBe(true);
    expect(RiskLevelSchema.safeParse("extreme").success).toBe(false);
  });

  it("validates PolicyEvaluationContextSchema and PolicyDecisionSchema", () => {
    const validContext = {
      actor: { id: "agent_coder", type: "agent", role: "developer" },
      project: { id: "prj_test" },
      operation: { type: "tool_execution", toolName: "write_to_file", arguments: { file: "test.ts" } },
      dataSensitivity: "normal",
    };
    expect(PolicyEvaluationContextSchema.safeParse(validContext).success).toBe(true);

    const validDecision = {
      decision: "require_approval",
      riskLevel: "high",
      reason: "High risk file write requires human approval",
      evaluatedAt: new Date().toISOString(),
      policyVersion: "1.0.0",
    };
    expect(PolicyDecisionSchema.safeParse(validDecision).success).toBe(true);
  });

  it("validates ApprovalRecordSchema with TOCTOU digest", () => {
    const validApproval = {
      approvalId: "app_12345",
      projectId: "prj_test",
      actorId: "agent_coder",
      action: "run_command",
      riskLevel: "high",
      argumentsDigest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      status: "pending",
      createdAt: new Date().toISOString(),
      policyVersion: "1.0.0",
    };
    expect(ApprovalRecordSchema.safeParse(validApproval).success).toBe(true);
  });
});
