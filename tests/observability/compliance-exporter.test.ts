import { describe, it, expect, beforeEach } from "vitest";
import { AuditLogger } from "../../src/observability/audit-logger.js";
import { ComplianceExporter } from "../../src/observability/compliance-exporter.js";

describe("P8.5 Observability — Compliance Report Exporter", () => {
  let logger: AuditLogger;
  let exporter: ComplianceExporter;

  beforeEach(() => {
    logger = new AuditLogger();
    exporter = new ComplianceExporter(logger);

    logger.record({
      event: { id: "evt_p1", projectId: "proj_compliance", type: "tool.approved" },
      actor: "user",
      action: "tool.approve",
      classification: "INFORMATIONAL",
      decision: "PERMIT",
      reasonCode: "HUMAN_APPROVED",
    });

    logger.record({
      event: { id: "evt_p2", projectId: "proj_compliance", type: "policy.denied" },
      actor: "agent",
      action: "policy.evaluate",
      classification: "POLICY_DENIED",
      decision: "DENY",
      reasonCode: "POLICY_SENSITIVE_WRITE_DENIED",
    });
  });

  it("exports verifiable compliance audit bundle for project with verified hash chain", () => {
    const report = exporter.exportReport("proj_compliance");

    expect(report.projectId).toBe("proj_compliance");
    expect(report.totalAuditEvents).toBe(2);
    expect(report.chainIntegrityVerified).toBe(true);
    expect(report.policyDenialsCount).toBe(1);
    expect(report.auditHeadDigest).toBeDefined();
    expect(report.auditHeadDigest.length).toBe(64);
  });
});
