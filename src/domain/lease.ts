import { z } from "zod";
import { AgentStartupPlanSchema } from "./agent.js";
import { TaskPrioritySchema, TaskStatusSchema } from "./task.js";

/**
 * Authoritative Lease lifecycle status.
 * PRD Part 2 Section 35.
 */
export const LeaseStatusSchema = z.enum([
  "ACTIVE",
  "RELEASED",
  "EXPIRED",
  "REVOKED",
]);
export type LeaseStatus = z.infer<typeof LeaseStatusSchema>;

/**
 * Authoritative TaskLease contract with monotonic generation fencing token.
 * PRD Part 2 Section 35, Section 52.
 */
export const TaskLeaseSchema = z.object({
  id: z.string().min(1), // leaseId
  taskId: z.string().min(1),
  agentId: z.string().min(1),
  instanceId: z.string().min(1),
  projectId: z.string().min(1),
  sessionId: z.string().min(1),
  generation: z.number().int().positive(), // fencing token (1, 2, 3...)
  acquiredAt: z.string().min(1), // ISO timestamp
  expiresAt: z.string().min(1), // ISO timestamp
  lastHeartbeatAt: z.string().min(1), // ISO timestamp
  ttlMs: z.number().int().positive(),
  status: LeaseStatusSchema,
  renewalCount: z.number().int().nonnegative(),
  maxRenewals: z.number().int().positive(),
  metadata: z.record(z.unknown()).optional(),
});
export type TaskLease = z.infer<typeof TaskLeaseSchema>;

/**
 * Task claim request payload.
 */
export const TaskClaimRequestSchema = z.object({
  taskId: z.string().min(1),
  agentId: z.string().min(1),
  instanceId: z.string().min(1),
  projectId: z.string().min(1),
  sessionId: z.string().min(1),
  startupPlan: AgentStartupPlanSchema.optional(),
  ttlMs: z.number().int().positive().optional(),
  maxRenewals: z.number().int().positive().optional(),
});
export type TaskClaimRequest = z.infer<typeof TaskClaimRequestSchema>;

/**
 * Task claim result payload.
 */
export const TaskClaimResultSchema = z.object({
  success: z.boolean(),
  lease: TaskLeaseSchema.optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
});
export type TaskClaimResult = z.infer<typeof TaskClaimResultSchema>;

/**
 * Task heartbeat request payload.
 * PRD Part 2 Section 36.
 */
export const TaskHeartbeatRequestSchema = z.object({
  leaseId: z.string().min(1),
  agentId: z.string().min(1),
  instanceId: z.string().min(1),
  generation: z.number().int().positive(),
  currentAction: z.string().optional(),
  lastTool: z.string().optional(),
  lastModelRequest: z.string().optional(),
  extensionMs: z.number().int().positive().optional(),
});
export type TaskHeartbeatRequest = z.infer<typeof TaskHeartbeatRequestSchema>;

/**
 * Task heartbeat result payload.
 */
export const TaskHeartbeatResultSchema = z.object({
  success: z.boolean(),
  lease: TaskLeaseSchema.optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
});
export type TaskHeartbeatResult = z.infer<typeof TaskHeartbeatResultSchema>;

/**
 * Task board query filter parameters.
 */
export const TaskBoardFilterSchema = z.object({
  projectId: z.string().min(1),
  sessionId: z.string().optional(),
  status: z.array(TaskStatusSchema).optional(),
  agentRole: z.string().optional(),
  priority: TaskPrioritySchema.optional(),
  limit: z.number().int().positive().optional(),
});
export type TaskBoardFilter = z.infer<typeof TaskBoardFilterSchema>;

/**
 * Stalled agent classification.
 * PRD Part 2 Section 37.
 */
export const StalledClassificationSchema = z.enum([
  "AGENT_CRASHED",
  "HEARTBEAT_TIMEOUT",
  "MAX_DURATION_EXCEEDED",
  "UNHEALTHY_PROCESS",
  "UNKNOWN",
]);
export type StalledClassification = z.infer<typeof StalledClassificationSchema>;

/**
 * Action taken when recovering a stalled lease.
 */
export const TaskRecoveryActionSchema = z.enum([
  "RECLAIM_AND_REQUEUE",
  "RETRY",
  "FAIL",
  "BLOCK_FOR_REVIEW",
]);
export type TaskRecoveryAction = z.infer<typeof TaskRecoveryActionSchema>;

/**
 * Record of a task recovery evaluation.
 */
export const TaskRecoveryRecordSchema = z.object({
  taskId: z.string().min(1),
  leaseId: z.string().min(1),
  agentId: z.string().min(1),
  classification: StalledClassificationSchema,
  action: TaskRecoveryActionSchema,
  attemptCount: z.number().int().positive(),
  maxAttempts: z.number().int().positive(),
  newGeneration: z.number().int().positive().optional(),
  timestamp: z.string().min(1),
  reason: z.string(),
});
export type TaskRecoveryRecord = z.infer<typeof TaskRecoveryRecordSchema>;
