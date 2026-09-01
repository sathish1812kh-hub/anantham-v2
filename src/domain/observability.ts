import { z } from "zod";

/**
 * Security Event Classifications.
 * PRD Part 3 Section 85.
 */
export const SecurityEventClassificationSchema = z.enum([
  "AUTHENTICATION_FAILURE",
  "AUTHORIZATION_DENIED",
  "POLICY_DENIED",
  "TOOL_DENIED",
  "PERMISSION_ESCALATION_ATTEMPT",
  "PROJECT_ISOLATION_VIOLATION",
  "SIGNATURE_FAILURE",
  "REPLAY_ATTEMPT",
  "SECRET_DETECTION",
  "INTEGRITY_FAILURE",
  "FENCING_VIOLATION",
  "RECOVERY_FAILURE",
  "RESOURCE_LIMIT",
  "PROMPT_INJECTION",
  "INVALID_EXTERNAL_INPUT",
  "INFORMATIONAL",
]);
export type SecurityEventClassification = z.infer<typeof SecurityEventClassificationSchema>;

/**
 * Authoritative Security & Audit Record.
 * PRD Part 1 Section 40 / PRD Part 3 Section 85.
 */
export const SecurityAuditRecordSchema = z.object({
  auditId: z.string().min(1),
  eventId: z.string().min(1),
  schemaVersion: z.number().int().positive().default(1),
  timestamp: z.string().min(1),
  projectId: z.string().optional(),
  sessionId: z.string().optional(),
  taskId: z.string().optional(),
  agentId: z.string().optional(),
  actor: z.string().min(1),
  action: z.string().min(1),
  classification: SecurityEventClassificationSchema,
  decision: z.enum(["PERMIT", "DENY", "MONITOR", "RETRY_EXHAUSTED", "UNKNOWN"]),
  reasonCode: z.string().min(1),
  correlationId: z.string().optional(),
  parentEventId: z.string().optional(),
  causationId: z.string().optional(),
  payloadDigest: z.string().min(1), // SHA-256 over sanitized payload
  previousRecordDigest: z.string().optional(), // Cryptographic hash chaining
  recordDigest: z.string().min(1), // SHA-256 over canonical record fields
  metadata: z.record(z.unknown()).default({}),
});
export type SecurityAuditRecord = z.infer<typeof SecurityAuditRecordSchema>;

/**
 * Telemetry Metric Type.
 */
export const MetricTypeSchema = z.enum(["COUNTER", "GAUGE", "HISTOGRAM"]);
export type MetricType = z.infer<typeof MetricTypeSchema>;

/**
 * Structured Telemetry Metric.
 */
export const TelemetryMetricSchema = z.object({
  name: z.string().min(1),
  type: MetricTypeSchema,
  value: z.number(),
  unit: z.string().default("count"),
  timestamp: z.string().min(1),
  projectId: z.string().optional(),
  sessionId: z.string().optional(),
  tags: z.record(z.string()).default({}),
});
export type TelemetryMetric = z.infer<typeof TelemetryMetricSchema>;

/**
 * Telemetry Execution Span.
 */
export const TelemetrySpanSchema = z.object({
  spanId: z.string().min(1),
  parentSpanId: z.string().optional(),
  traceId: z.string().min(1),
  name: z.string().min(1),
  startTime: z.string().min(1),
  endTime: z.string().optional(),
  durationMs: z.number().optional(),
  projectId: z.string().optional(),
  sessionId: z.string().optional(),
  status: z.enum(["OK", "ERROR", "CANCELLED"]).default("OK"),
  attributes: z.record(z.unknown()).default({}),
});
export type TelemetrySpan = z.infer<typeof TelemetrySpanSchema>;

/**
 * System Diagnostic Report.
 * PRD Part 2 Section 170.
 */
export const DiagnosticReportSchema = z.object({
  reportId: z.string().min(1),
  timestamp: z.string().min(1),
  status: z.enum(["HEALTHY", "DEGRADED", "UNHEALTHY"]),
  sqliteIntegrity: z.boolean(),
  migrationsApplied: z.number().int().min(0),
  activeLeasesCount: z.number().int().min(0),
  orphanedTasksCount: z.number().int().min(0),
  crashedJobsCount: z.number().int().min(0),
  unresolvedAnomalies: z.array(z.string()).default([]),
  checks: z.record(z.boolean()).default({}),
});
export type DiagnosticReport = z.infer<typeof DiagnosticReportSchema>;

/**
 * Compliance Audit Report Bundle.
 * PRD Part 3 Section 100.
 */
export const ComplianceReportSchema = z.object({
  reportId: z.string().min(1),
  generatedAt: z.string().min(1),
  projectId: z.string(),
  totalAuditEvents: z.number().int().min(0),
  chainIntegrityVerified: z.boolean(),
  policyDenialsCount: z.number().int().min(0),
  securityAnomaliesCount: z.number().int().min(0),
  auditHeadDigest: z.string().min(1),
  records: z.array(SecurityAuditRecordSchema),
});
export type ComplianceReport = z.infer<typeof ComplianceReportSchema>;
