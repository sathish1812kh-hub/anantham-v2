import { z } from "zod";
import { WorkflowBudgetSchema, WorkflowBudgetConsumptionSchema } from "./workflow.js";

/**
 * Authoritative Background Job lifecycle status.
 * PRD Part 2 Section 120–135.
 */
export const JobStatusSchema = z.enum([
  "CREATED",
  "QUEUED",
  "CLAIMING",
  "RUNNING",
  "PAUSED",
  "CANCEL_REQUESTED",
  "CANCELLED",
  "COMPLETING",
  "COMPLETED",
  "FAILED",
  "TIMED_OUT",
  "ORPHANED",
  "RECOVERY_REQUIRED",
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

/**
 * Failure classification categories for background jobs.
 */
export const JobFailureClassificationSchema = z.enum([
  "POLICY_DENIAL",
  "PERMISSION_DENIED",
  "INVALID_SCHEMA",
  "PERMANENT_CAPABILITY_FAILURE",
  "RATE_LIMIT",
  "TIMEOUT",
  "NETWORK_ERROR",
  "TRANSIENT_TOOL_ERROR",
  "UNKNOWN",
]);
export type JobFailureClassification = z.infer<typeof JobFailureClassificationSchema>;

/**
 * Authoritative BackgroundJob Domain Contract.
 * PRD Part 2 Section 120–135.
 */
export const BackgroundJobSchema = z.object({
  id: z.string().min(1), // jobId
  projectId: z.string().min(1),
  sessionId: z.string().min(1),
  taskId: z.string().min(1),
  workflowId: z.string().optional(),
  runId: z.string().optional(),
  agentId: z.string().min(1),
  instanceId: z.string().min(1),
  status: JobStatusSchema.default("CREATED"),
  createdAt: z.string().min(1), // ISO timestamp
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  heartbeatAt: z.string().optional(),
  deadline: z.string().optional(), // Execution deadline ISO timestamp
  attempt: z.number().int().min(0).default(0),
  maxAttempts: z.number().int().min(1).default(3),
  leaseId: z.string().optional(),
  generation: z.number().int().positive().optional(), // Monotonic fencing token
  budget: WorkflowBudgetSchema.optional(),
  consumption: WorkflowBudgetConsumptionSchema.default({
    tokens: 0,
    costUsd: 0,
    durationMs: 0,
    toolCalls: 0,
  }),
  cancellationRequestedAt: z.string().optional(),
  cancellationReason: z.string().optional(),
  failureClassification: JobFailureClassificationSchema.optional(),
  errorMessage: z.string().optional(),
  resultArtifacts: z.array(z.string()).default([]),
  resultData: z.unknown().optional(),
  checkpointId: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type BackgroundJob = z.infer<typeof BackgroundJobSchema>;

/**
 * Request payload to create a new background job.
 */
export const JobCreationRequestSchema = z.object({
  id: z.string().optional(),
  projectId: z.string().min(1),
  sessionId: z.string().min(1),
  taskId: z.string().optional(),
  objective: z.string().min(1),
  workflowId: z.string().optional(),
  runId: z.string().optional(),
  agentId: z.string().min(1),
  instanceId: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
  maxAttempts: z.number().int().min(1).optional(),
  budget: WorkflowBudgetSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type JobCreationRequest = z.infer<typeof JobCreationRequestSchema>;

/**
 * Request payload to claim a background job.
 */
export const JobClaimRequestSchema = z.object({
  jobId: z.string().min(1),
  agentId: z.string().min(1),
  instanceId: z.string().min(1),
  projectId: z.string().min(1),
  sessionId: z.string().min(1),
  ttlMs: z.number().int().positive().optional(),
  maxRenewals: z.number().int().positive().optional(),
});
export type JobClaimRequest = z.infer<typeof JobClaimRequestSchema>;
