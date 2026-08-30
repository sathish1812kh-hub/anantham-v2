import { z } from "zod";
import type { Project } from "../domain/project.js";
import type { Session } from "../domain/session.js";
import type { Task } from "../domain/task.js";
import type { Checkpoint } from "../domain/checkpoint.js";
import type { ReconstructedSessionState } from "../event-state/reconstruction/session-reconstruct.js";

/**
 * Resume target specification.
 * PRD Part 1 Section 55 & PRD Part 3 Section 15.
 */
export const ResumeTargetSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("last"),
    projectId: z.string().optional(),
  }),
  z.object({
    type: z.literal("session"),
    sessionId: z.string().min(1),
  }),
  z.object({
    type: z.literal("project"),
    projectName: z.string().min(1),
  }),
  z.object({
    type: z.literal("checkpoint"),
    checkpointId: z.string().min(1),
  }),
]);
export type ResumeTarget = z.infer<typeof ResumeTargetSchema>;

/**
 * Optional resume configuration overrides.
 */
export const ResumeOptionsSchema = z.object({
  overrideModelProfile: z.string().optional(),
  overrideTrustProfile: z.string().optional(),
  dryRun: z.boolean().optional(),
  forceRebuildProjections: z.boolean().optional(),
});
export type ResumeOptions = z.infer<typeof ResumeOptionsSchema>;

/**
 * Resume request.
 */
export const ResumeRequestSchema = z.object({
  target: ResumeTargetSchema,
  options: ResumeOptionsSchema.optional(),
});
export type ResumeRequest = z.infer<typeof ResumeRequestSchema>;

/**
 * Restored Task DAG and execution topology.
 */
export const RestoredTaskDAGSchema = z.object({
  totalTasksCount: z.number().int().nonnegative(),
  tasks: z.array(z.any()),
  activeTaskId: z.string().nullable(),
  queuedTasks: z.array(z.any()),
  runningTasks: z.array(z.any()),
  blockedTasks: z.array(z.any()),
  completedTasks: z.array(z.any()),
  failedTasks: z.array(z.any()),
  cancelledTasks: z.array(z.any()),
  executionOrder: z.array(z.string()),
  unresolvedDependencies: z.record(z.array(z.string())),
});
export type RestoredTaskDAG = z.infer<typeof RestoredTaskDAGSchema> & {
  tasks: Readonly<Task>[];
  queuedTasks: Readonly<Task>[];
  runningTasks: Readonly<Task>[];
  blockedTasks: Readonly<Task>[];
  completedTasks: Readonly<Task>[];
  failedTasks: Readonly<Task>[];
  cancelledTasks: Readonly<Task>[];
};

/**
 * Individual restored pending approval.
 */
export const PendingApprovalItemSchema = z.object({
  approvalId: z.string().min(1),
  taskId: z.string().min(1),
  action: z.string().min(1),
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
  requestedBy: z.string().min(1),
  createdAt: z.string().min(1),
  expiresAt: z.string().optional(),
  payload: z.record(z.unknown()),
});
export type PendingApprovalItem = z.infer<typeof PendingApprovalItemSchema>;

/**
 * Restored pending approvals queue.
 */
export const RestoredPendingApprovalsSchema = z.object({
  pendingApprovalsCount: z.number().int().nonnegative(),
  approvals: z.array(PendingApprovalItemSchema),
});
export type RestoredPendingApprovals = z.infer<typeof RestoredPendingApprovalsSchema>;

/**
 * Validation report produced during resume.
 */
export const ResumeValidationResultSchema = z.object({
  isValid: z.boolean(),
  projectValid: z.boolean(),
  sessionValid: z.boolean(),
  checkpointValid: z.boolean(),
  gitStateValid: z.boolean(),
  permissionsValid: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
});
export type ResumeValidationResult = z.infer<typeof ResumeValidationResultSchema>;

/**
 * Complete, machine-verifiable Resume result.
 * PRD Part 1 Section 56-57.
 */
export const ResumeResultSchema = z.object({
  success: z.boolean(),
  resumeId: z.string().min(1),
  projectId: z.string().min(1),
  sessionId: z.string().min(1),
  project: z.any(),
  session: z.any(),
  checkpoint: z.any().optional(),
  sessionState: z.any(),
  taskDAG: RestoredTaskDAGSchema,
  pendingApprovals: RestoredPendingApprovalsSchema,
  artifactsSummary: z.object({
    totalArtifactsCount: z.number().int().nonnegative(),
    validArtifactsCount: z.number().int().nonnegative(),
    missingArtifactIds: z.array(z.string()),
  }),
  eventOffset: z.number().int().nonnegative(),
  resumedAt: z.string().min(1),
  message: z.string(),
});
export type ResumeResult = z.infer<typeof ResumeResultSchema> & {
  project: Readonly<Project>;
  session: Readonly<Session>;
  checkpoint?: Readonly<Checkpoint>;
  sessionState: ReconstructedSessionState;
  taskDAG: RestoredTaskDAG;
  pendingApprovals: RestoredPendingApprovals;
};
