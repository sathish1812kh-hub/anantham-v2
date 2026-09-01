import { describe, it, expect } from "vitest";
import {
  SecurityAuditRecordSchema,
  TelemetryMetricSchema,
  TelemetrySpanSchema,
  DiagnosticReportSchema,
  ComplianceReportSchema,
} from "../../src/domain/observability.js";

describe("P8.5 Observability — Domain Contracts & Schema Validation", () => {
  it("validates SecurityAuditRecordSchema", () => {
    const valid = {
      auditId: "audit_01",
      eventId: "evt_01",
      schemaVersion: 1,
      timestamp: new Date().toISOString(),
      projectId: "proj_01",
      actor: "user",
      action: "policy.evaluate",
      classification: "POLICY_DENIED",
      decision: "DENY",
      reasonCode: "POLICY_TOOL_RESTRICTED",
      payloadDigest: "abc123payload",
      recordDigest: "def456record",
      metadata: {},
    };
    const parsed = SecurityAuditRecordSchema.parse(valid);
    expect(parsed.classification).toBe("POLICY_DENIED");
    expect(parsed.decision).toBe("DENY");
  });

  it("validates TelemetryMetricSchema", () => {
    const valid = {
      name: "tool.execution_time",
      type: "HISTOGRAM",
      value: 142.5,
      unit: "ms",
      timestamp: new Date().toISOString(),
      tags: { tool: "fs.read" },
    };
    const parsed = TelemetryMetricSchema.parse(valid);
    expect(parsed.name).toBe("tool.execution_time");
    expect(parsed.value).toBe(142.5);
  });

  it("validates TelemetrySpanSchema", () => {
    const valid = {
      spanId: "span_01",
      traceId: "trace_99",
      name: "agent.step",
      startTime: new Date().toISOString(),
      status: "OK",
    };
    const parsed = TelemetrySpanSchema.parse(valid);
    expect(parsed.name).toBe("agent.step");
  });

  it("validates DiagnosticReportSchema", () => {
    const valid = {
      reportId: "diag_01",
      timestamp: new Date().toISOString(),
      status: "HEALTHY",
      sqliteIntegrity: true,
      migrationsApplied: 9,
      activeLeasesCount: 0,
      orphanedTasksCount: 0,
      crashedJobsCount: 0,
      unresolvedAnomalies: [],
      checks: { sqlite_integrity: true },
    };
    const parsed = DiagnosticReportSchema.parse(valid);
    expect(parsed.status).toBe("HEALTHY");
    expect(parsed.sqliteIntegrity).toBe(true);
  });

  it("validates ComplianceReportSchema", () => {
    const valid = {
      reportId: "comp_01",
      generatedAt: new Date().toISOString(),
      projectId: "proj_01",
      totalAuditEvents: 0,
      chainIntegrityVerified: true,
      policyDenialsCount: 0,
      securityAnomaliesCount: 0,
      auditHeadDigest: "0000000000000000000000000000000000000000000000000000000000000000",
      records: [],
    };
    const parsed = ComplianceReportSchema.parse(valid);
    expect(parsed.chainIntegrityVerified).toBe(true);
  });
});
