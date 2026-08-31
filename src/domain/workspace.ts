import { z } from "zod";

/**
 * Execution Workspace lifecycle status.
 * PRD Part 2 Section 52, Section 56.
 */
export const WorkspaceStatusSchema = z.enum([
  "CREATING",
  "READY",
  "ACTIVE",
  "CHANGES_PRESENT",
  "VERIFYING",
  "INTEGRATED",
  "CONFLICT_DETECTED",
  "QUARANTINED",
  "CLEANUP_PENDING",
  "CLEANED",
  "FAILED",
]);
export type WorkspaceStatus = z.infer<typeof WorkspaceStatusSchema>;

/**
 * Workspace cleanup state.
 */
export const WorkspaceCleanupStateSchema = z.enum([
  "NONE",
  "PENDING",
  "CLEANED",
  "QUARANTINED",
]);
export type WorkspaceCleanupState = z.infer<typeof WorkspaceCleanupStateSchema>;

/**
 * Execution Workspace contract.
 * Binds an isolated Git worktree to a task, agent, lease, and monotonic fencing token.
 * PRD Part 2 Section 52.
 */
export const ExecutionWorkspaceSchema = z.object({
  id: z.string().min(1), // workspaceId (e.g., ws_...)
  projectId: z.string().min(1),
  taskId: z.string().min(1),
  agentId: z.string().min(1),
  instanceId: z.string().min(1),
  leaseId: z.string().min(1),
  generation: z.number().int().positive(), // fencing token (1, 2, 3...)
  baseCommit: z.string().min(1), // Git SHA
  baseBranch: z.string().min(1),
  worktreePath: z.string().min(1), // Absolute or relative filesystem path
  branchName: z.string().min(1), // e.g. anantham/ws-<id>
  status: WorkspaceStatusSchema,
  cleanupState: WorkspaceCleanupStateSchema,
  quarantineReason: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string().min(1), // ISO timestamp
  lastVerifiedAt: z.string().min(1), // ISO timestamp
});
export type ExecutionWorkspace = z.infer<typeof ExecutionWorkspaceSchema>;

/**
 * Change-set metadata capturing exact file mutations and deterministic hashes.
 * PRD Part 2 Section 54.
 */
export const ChangeSetMetadataSchema = z.object({
  workspaceId: z.string().min(1),
  baseCommit: z.string().min(1),
  headCommit: z.string().min(1),
  targetCommit: z.string().min(1),
  filesAdded: z.array(z.string()),
  filesModified: z.array(z.string()),
  filesDeleted: z.array(z.string()),
  filesRenamed: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
    })
  ),
  fileHashes: z.record(z.string()), // relative path -> SHA-256
  symbolsModified: z
    .array(
      z.object({
        file: z.string(),
        symbol: z.string(),
        kind: z.string(),
      })
    )
    .optional(),
  patch: z.string(), // unified diff
  changeSetHash: z.string().min(1), // deterministic SHA-256 of the change set
  createdAt: z.string().min(1),
});
export type ChangeSetMetadata = z.infer<typeof ChangeSetMetadataSchema>;

/**
 * Deterministic conflict classification categories.
 * PRD Part 2 Section 53.
 */
export const ConflictClassificationSchema = z.enum([
  "NO_CONFLICT",
  "FILE_CONFLICT", // same file modified concurrently
  "DELETE_MODIFY_CONFLICT", // one deletes, other modifies
  "RENAME_CONFLICT", // rename collision
  "ADD_ADD_CONFLICT", // same file added with different content
  "BASE_DIVERGENCE", // target branch moved ahead of workspace base commit
  "CONTRACT_CONFLICT", // shared domain contract modified
  "MIGRATION_CONFLICT", // database migration conflict
  "EVENT_SCHEMA_CONFLICT", // event schema conflict
  "PUBLIC_API_CONFLICT", // index/public export collision
  "USER_CHANGE_CONFLICT", // uncommitted or external user change on target
  "UNKNOWN_CONFLICT", // fails closed
]);
export type ConflictClassification = z.infer<typeof ConflictClassificationSchema>;

/**
 * Detailed conflict report.
 */
export const ConflictReportSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  conflictingWorkspaceId: z.string().optional(),
  conflictType: ConflictClassificationSchema,
  conflictingFiles: z.array(z.string()),
  conflictingSymbols: z.array(z.string()).optional(),
  details: z.string().min(1),
  reconciliationSuggestion: z
    .enum(["RESERIALIZE", "REBASE", "MANUAL_RECONCILIATION", "REJECT"])
    .optional(),
  detectedAt: z.string().min(1),
});
export type ConflictReport = z.infer<typeof ConflictReportSchema>;

/**
 * Integration request parameters.
 * PRD Part 2 Section 55.
 */
export const IntegrationRequestSchema = z.object({
  workspaceId: z.string().min(1),
  taskId: z.string().min(1),
  agentId: z.string().min(1),
  instanceId: z.string().min(1),
  leaseId: z.string().min(1),
  generation: z.number().int().positive(),
  targetBranch: z.string().min(1),
  runVerification: z.boolean().default(true),
  commitMessage: z.string().optional(),
});
export type IntegrationRequest = z.infer<typeof IntegrationRequestSchema>;

/**
 * Integration result payload.
 */
export const IntegrationResultSchema = z.object({
  success: z.boolean(),
  workspaceId: z.string().min(1),
  integratedCommit: z.string().optional(),
  conflictReport: ConflictReportSchema.optional(),
  status: z.enum([
    "INTEGRATED",
    "CONFLICT_REJECTED",
    "VERIFICATION_FAILED",
    "FENCING_VIOLATION",
    "USER_CHANGE_BLOCKED",
    "ERROR",
  ]),
  errorMessage: z.string().optional(),
});
export type IntegrationResult = z.infer<typeof IntegrationResultSchema>;

/**
 * Workspace quarantine record preserving uncommitted changes as patch artifacts.
 * PRD Part 2 Section 56.
 */
export const WorkspaceQuarantineRecordSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  reason: z.string().min(1),
  patch: z.string(),
  exportedArtifactId: z.string().optional(),
  createdAt: z.string().min(1),
});
export type WorkspaceQuarantineRecord = z.infer<
  typeof WorkspaceQuarantineRecordSchema
>;
