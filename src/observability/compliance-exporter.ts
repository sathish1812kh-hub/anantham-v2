import { randomUUID } from "node:crypto";
import { type AuditLogger } from "./audit-logger.js";
import {
  type ComplianceReport,
  ComplianceReportSchema,
} from "../domain/observability.js";
import { AuditLogger as AuditLoggerClass } from "./audit-logger.js";

export class ComplianceExporter {
  private readonly auditLogger: AuditLogger;

  constructor(auditLogger: AuditLogger) {
    this.auditLogger = auditLogger;
  }

  /**
   * Export a verifiable compliance audit report for a project.
   */
  public exportReport(projectId: string): ComplianceReport {
    const records = this.auditLogger.query({ projectId, limit: 10000 });
    const verifyResult = AuditLoggerClass.verifyChain(records);

    const policyDenials = records.filter(
      (r) => r.decision === "DENY" || r.classification === "POLICY_DENIED" || r.classification === "TOOL_DENIED"
    ).length;

    const securityAnomalies = records.filter(
      (r) =>
        r.classification === "PROMPT_INJECTION" ||
        r.classification === "PROJECT_ISOLATION_VIOLATION" ||
        r.classification === "SIGNATURE_FAILURE" ||
        r.classification === "AUTHENTICATION_FAILURE" ||
        r.classification === "REPLAY_ATTEMPT"
    ).length;

    const headDigest = records.length > 0 ? records[records.length - 1]!.recordDigest : "0000000000000000000000000000000000000000000000000000000000000000";

    return ComplianceReportSchema.parse({
      reportId: `compliance_${randomUUID().slice(0, 8)}`,
      generatedAt: new Date().toISOString(),
      projectId,
      totalAuditEvents: records.length,
      chainIntegrityVerified: verifyResult.valid,
      policyDenialsCount: policyDenials,
      securityAnomaliesCount: securityAnomalies,
      auditHeadDigest: headDigest,
      records,
    });
  }
}
