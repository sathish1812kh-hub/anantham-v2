import { z } from "zod";

/**
 * Anantham V2 — Side Effects & Retry Plane Domain Contracts
 * PRD Part 1 Section 83-90 & PRD Part 2 Section 241-248 / P4.5
 */

export const SideEffectCategorySchema = z.enum([
  "read_only",
  "idempotent_write",
  "reversible_write",
  "non_idempotent_write",
  "unknown",
]);
export type SideEffectCategory = z.infer<typeof SideEffectCategorySchema>;

export const OutcomeCertaintySchema = z.enum([
  "known_succeeded",
  "known_failed",
  "unknown",
]);
export type OutcomeCertainty = z.infer<typeof OutcomeCertaintySchema>;

export const RetryDecisionCodeSchema = z.enum([
  "allow_retry",
  "reject_non_idempotent",
  "reject_unknown_outcome",
  "reject_budget_exhausted",
  "reject_non_retryable_error",
  "reject_policy_expired",
  "reconciliation_required",
]);
export type RetryDecisionCode = z.infer<typeof RetryDecisionCodeSchema>;

export const RetryDecisionSchema = z.object({
  decisionCode: RetryDecisionCodeSchema,
  allowRetry: z.boolean(),
  reason: z.string().min(1),
  attemptNumber: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  budgetRemaining: z.number().int().nonnegative(),
  recommendedDelayMs: z.number().int().nonnegative().optional().default(0),
  reconciliationAction: z.string().optional(),
});
export type RetryDecision = z.infer<typeof RetryDecisionSchema>;

export const RetryBudgetConfigSchema = z.object({
  maxGlobalRetries: z.number().int().positive().optional().default(50),
  maxTaskRetries: z.number().int().positive().optional().default(10),
  maxOperationRetries: z.number().int().positive().optional().default(3),
  backoffBaseMs: z.number().int().positive().optional().default(200),
  backoffMaxMs: z.number().int().positive().optional().default(5000),
});
export type RetryBudgetConfig = z.infer<typeof RetryBudgetConfigSchema>;

export const RetryBudgetUsageSchema = z.object({
  globalRetries: z.number().int().nonnegative(),
  taskRetries: z.number().int().nonnegative(),
  operationRetries: z.number().int().nonnegative(),
});
export type RetryBudgetUsage = z.infer<typeof RetryBudgetUsageSchema>;

export const FileDivergenceRecordSchema = z.object({
  filePath: z.string().min(1),
  baseHash: z.string().min(1),
  currentHash: z.string().min(1),
  expectedHash: z.string().optional(),
  status: z.enum(["synced", "diverged", "file_missing", "file_created"]),
  detectedAt: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});
export type FileDivergenceRecord = z.infer<typeof FileDivergenceRecordSchema>;

export const WorktreeDivergenceRecordSchema = z.object({
  worktreePath: z.string().min(1),
  branch: z.string().optional(),
  headCommit: z.string().optional(),
  hasUncommittedChanges: z.boolean(),
  modifiedFiles: z.array(z.string()).default([]),
  status: z.enum(["clean", "diverged", "detached", "locked"]),
  detectedAt: z.string().min(1),
});
export type WorktreeDivergenceRecord = z.infer<typeof WorktreeDivergenceRecordSchema>;

export const SideEffectJournalEntrySchema = z.object({
  journalId: z.string().min(1),
  projectId: z.string().min(1),
  sessionId: z.string().optional(),
  taskId: z.string().optional(),
  callId: z.string().min(1),
  toolName: z.string().min(1),
  category: SideEffectCategorySchema,
  outcomeCertainty: OutcomeCertaintySchema,
  idempotencyKey: z.string().optional(),
  requestHash: z.string().min(1),
  responseStatus: z.string().optional(),
  attemptNumber: z.number().int().positive().default(1),
  executedAt: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});
export type SideEffectJournalEntry = z.infer<typeof SideEffectJournalEntrySchema>;
