import { randomUUID } from "node:crypto";
import {
  type ChangeSetMetadata,
  type ConflictReport,
  ConflictReportSchema,
} from "../domain/workspace.js";
import { type GitWorkingTreeStatus } from "./git-worktree-manager.js";

/**
 * Deterministic Conflict Detector.
 * Evaluates file overlaps, contract/migration collisions, delete-modify conflicts,
 * base divergence, and external user modifications.
 * PRD Part 2 Section 53.
 */
export class ConflictDetector {
  /**
   * Detect potential conflicts between a workspace changeset, peer active changesets,
   * and the target repository state.
   */
  public detectConflicts(
    primaryChangeSet: ChangeSetMetadata,
    peerChangeSets: ChangeSetMetadata[],
    targetStatus?: GitWorkingTreeStatus
  ): ConflictReport | null {
    const now = new Date().toISOString();

    // 1. User / External Change Check on Target Branch
    if (targetStatus && !targetStatus.isClean) {
      return ConflictReportSchema.parse({
        id: randomUUID(),
        workspaceId: primaryChangeSet.workspaceId,
        conflictType: "USER_CHANGE_CONFLICT",
        conflictingFiles: [...targetStatus.modifiedFiles, ...targetStatus.untrackedFiles],
        details: `Target working tree is dirty with ${targetStatus.modifiedFiles.length} uncommitted user modifications. Integration is blocked to protect user changes.`,
        reconciliationSuggestion: "MANUAL_RECONCILIATION",
        detectedAt: now,
      });
    }

    // 2. Base Revision Divergence Check
    if (targetStatus && targetStatus.headCommit !== primaryChangeSet.baseCommit) {
      return ConflictReportSchema.parse({
        id: randomUUID(),
        workspaceId: primaryChangeSet.workspaceId,
        conflictType: "BASE_DIVERGENCE",
        conflictingFiles: [],
        details: `Target branch has advanced from base commit "${primaryChangeSet.baseCommit}" to "${targetStatus.headCommit}". Workspace requires rebase before integration.`,
        reconciliationSuggestion: "REBASE",
        detectedAt: now,
      });
    }

    const primaryAllFiles = new Set([
      ...primaryChangeSet.filesAdded,
      ...primaryChangeSet.filesModified,
      ...primaryChangeSet.filesDeleted,
      ...primaryChangeSet.filesRenamed.map((r) => r.to),
    ]);

    // 3. Compare with each active peer workspace
    for (const peer of peerChangeSets) {
      if (peer.workspaceId === primaryChangeSet.workspaceId) continue;

      const peerAllFiles = new Set([
        ...peer.filesAdded,
        ...peer.filesModified,
        ...peer.filesDeleted,
        ...peer.filesRenamed.map((r) => r.to),
      ]);

      // A. Event Schema Conflict
      const primaryHasEvent = [...primaryAllFiles].some((f) => f.replace(/\\/g, "/") === "src/domain/event.ts");
      const peerHasEvent = [...peerAllFiles].some((f) => f.replace(/\\/g, "/") === "src/domain/event.ts");
      if (primaryHasEvent && peerHasEvent) {
        return ConflictReportSchema.parse({
          id: randomUUID(),
          workspaceId: primaryChangeSet.workspaceId,
          conflictingWorkspaceId: peer.workspaceId,
          conflictType: "EVENT_SCHEMA_CONFLICT",
          conflictingFiles: ["src/domain/event.ts"],
          details: `Event schema conflict: both workspaces modified canonical event definitions in src/domain/event.ts.`,
          reconciliationSuggestion: "RESERIALIZE",
          detectedAt: now,
        });
      }

      // B. Public API Export Collision
      const primaryHasIndex = [...primaryAllFiles].some((f) => f.replace(/\\/g, "/") === "src/index.ts");
      const peerHasIndex = [...peerAllFiles].some((f) => f.replace(/\\/g, "/") === "src/index.ts");
      if (primaryHasIndex && peerHasIndex) {
        return ConflictReportSchema.parse({
          id: randomUUID(),
          workspaceId: primaryChangeSet.workspaceId,
          conflictingWorkspaceId: peer.workspaceId,
          conflictType: "PUBLIC_API_CONFLICT",
          conflictingFiles: ["src/index.ts"],
          details: `Public API collision detected: both workspaces modify public exports in src/index.ts.`,
          reconciliationSuggestion: "RESERIALIZE",
          detectedAt: now,
        });
      }

      // C. Database Migration Conflict
      const primaryMigrations = [...primaryAllFiles].filter((f) => f.replace(/\\/g, "/").startsWith("src/persistence/migrations/"));
      const peerMigrations = [...peerAllFiles].filter((f) => f.replace(/\\/g, "/").startsWith("src/persistence/migrations/"));
      if (primaryMigrations.length > 0 && peerMigrations.length > 0) {
        return ConflictReportSchema.parse({
          id: randomUUID(),
          workspaceId: primaryChangeSet.workspaceId,
          conflictingWorkspaceId: peer.workspaceId,
          conflictType: "MIGRATION_CONFLICT",
          conflictingFiles: [...new Set([...primaryMigrations, ...peerMigrations])],
          details: `Database schema migration conflict detected: both workspaces introduce migration files.`,
          reconciliationSuggestion: "RESERIALIZE",
          detectedAt: now,
        });
      }

      // D. Shared Contract Conflict (domain model symbols)
      const primaryContracts = [...primaryAllFiles].filter((f) => f.replace(/\\/g, "/").startsWith("src/domain/"));
      const peerContracts = [...peerAllFiles].filter((f) => f.replace(/\\/g, "/").startsWith("src/domain/"));
      if (primaryContracts.length > 0 && peerContracts.length > 0) {
        return ConflictReportSchema.parse({
          id: randomUUID(),
          workspaceId: primaryChangeSet.workspaceId,
          conflictingWorkspaceId: peer.workspaceId,
          conflictType: "CONTRACT_CONFLICT",
          conflictingFiles: [...new Set([...primaryContracts, ...peerContracts])],
          details: `Shared domain contract conflict detected: both workspaces modified domain models in src/domain/.`,
          reconciliationSuggestion: "RESERIALIZE",
          detectedAt: now,
        });
      }

      // E. Delete / Modify Conflict
      const deleteModifyOverlap = [
        ...primaryChangeSet.filesDeleted.filter((f) => peer.filesModified.includes(f)),
        ...peer.filesDeleted.filter((f) => primaryChangeSet.filesModified.includes(f)),
      ];
      if (deleteModifyOverlap.length > 0) {
        return ConflictReportSchema.parse({
          id: randomUUID(),
          workspaceId: primaryChangeSet.workspaceId,
          conflictingWorkspaceId: peer.workspaceId,
          conflictType: "DELETE_MODIFY_CONFLICT",
          conflictingFiles: deleteModifyOverlap,
          details: `Delete-Modify conflict detected: files [${deleteModifyOverlap.join(", ")}] deleted by one workspace and modified by another.`,
          reconciliationSuggestion: "RESERIALIZE",
          detectedAt: now,
        });
      }

      // F. Rename Conflict
      const primaryRenamedTo = primaryChangeSet.filesRenamed.map((r) => r.to);
      const peerRenamedTo = peer.filesRenamed.map((r) => r.to);
      const renameOverlap = primaryRenamedTo.filter((f) => peerRenamedTo.includes(f));
      if (renameOverlap.length > 0) {
        return ConflictReportSchema.parse({
          id: randomUUID(),
          workspaceId: primaryChangeSet.workspaceId,
          conflictingWorkspaceId: peer.workspaceId,
          conflictType: "RENAME_CONFLICT",
          conflictingFiles: renameOverlap,
          details: `Rename conflict detected: both workspaces rename to same target file [${renameOverlap.join(", ")}].`,
          reconciliationSuggestion: "RESERIALIZE",
          detectedAt: now,
        });
      }

      // G. Add / Add Conflict
      const addAddOverlap = primaryChangeSet.filesAdded.filter((f) => peer.filesAdded.includes(f));
      const differingAddAdds = addAddOverlap.filter(
        (f) => primaryChangeSet.fileHashes[f] !== peer.fileHashes[f]
      );
      if (differingAddAdds.length > 0) {
        return ConflictReportSchema.parse({
          id: randomUUID(),
          workspaceId: primaryChangeSet.workspaceId,
          conflictingWorkspaceId: peer.workspaceId,
          conflictType: "ADD_ADD_CONFLICT",
          conflictingFiles: differingAddAdds,
          details: `Add-Add conflict detected: both workspaces add file [${differingAddAdds.join(", ")}] with differing content hashes.`,
          reconciliationSuggestion: "RESERIALIZE",
          detectedAt: now,
        });
      }

      // H. Same-File Overlap (Modified by both)
      const sameFileOverlap = primaryChangeSet.filesModified.filter((f) => peer.filesModified.includes(f));
      if (sameFileOverlap.length > 0) {
        return ConflictReportSchema.parse({
          id: randomUUID(),
          workspaceId: primaryChangeSet.workspaceId,
          conflictingWorkspaceId: peer.workspaceId,
          conflictType: "FILE_CONFLICT",
          conflictingFiles: sameFileOverlap,
          details: `Direct file conflict detected: both workspaces modified file [${sameFileOverlap.join(", ")}].`,
          reconciliationSuggestion: "RESERIALIZE",
          detectedAt: now,
        });
      }
    }

    return null;
  }
}
