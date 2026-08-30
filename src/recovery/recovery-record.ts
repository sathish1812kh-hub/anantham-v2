import { z } from "zod";

/**
 * Anomaly classification types detected during recovery.
 * PRD Part 1 Section 47.
 */
export const RecoveryAnomalyTypeSchema = z.enum([
  "STALE_LEASE",
  "ORPHAN_ARTIFACT",
  "MISSING_ARTIFACT_FILE",
  "CORRUPTED_CHECKPOINT",
  "UNCOMMITTED_TASK",
  "EVENT_SEQUENCE_GAP",
  "INTEGRITY_VIOLATION",
]);
export type RecoveryAnomalyType = z.infer<typeof RecoveryAnomalyTypeSchema>;

/**
 * An individual anomaly detected during recovery.
 */
export const RecoveryAnomalySchema = z.object({
  type: RecoveryAnomalyTypeSchema,
  entityId: z.string().min(1),
  description: z.string().min(1),
  actionTaken: z.enum(["REPAIRED", "EVICTED", "PRESERVED", "FLAGGED", "IGNORED"]),
  timestamp: z.string().min(1),
});
export type RecoveryAnomaly = z.infer<typeof RecoveryAnomalySchema>;

/**
 * Structured Recovery Record generated after crash/startup recovery.
 * PRD Part 1 Section 47.
 */
export const RecoveryRecordSchema = z.object({
  recoveryId: z.string().min(1),
  startedAt: z.string().min(1),
  completedAt: z.string().min(1),
  status: z.enum(["SUCCESS", "WARNING", "CRITICAL_ERROR"]),
  databaseIntegrityPassed: z.boolean(),
  eventsValidatedCount: z.number().int().nonnegative(),
  projectionsRebuiltCount: z.number().int().nonnegative(),
  staleLeasesEvictedCount: z.number().int().nonnegative(),
  orphansDetectedCount: z.number().int().nonnegative(),
  anomalies: z.array(RecoveryAnomalySchema),
  message: z.string(),
});
export type RecoveryRecord = z.infer<typeof RecoveryRecordSchema>;
