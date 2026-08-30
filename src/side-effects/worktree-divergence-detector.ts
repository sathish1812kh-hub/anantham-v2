import { exec } from "node:child_process";
import { promisify } from "node:util";
import {
  type WorktreeDivergenceRecord,
} from "../domain/side-effect.js";

const execAsync = promisify(exec);

/**
 * Anantham V2 — Worktree Divergence Detector
 * Playbook Section 138 & PRD Part 2 Section 242
 */
export class WorktreeDivergenceDetector {
  public async inspect(worktreePath: string): Promise<WorktreeDivergenceRecord> {
    const now = new Date().toISOString();

    try {
      // 1. Get branch and commit
      const { stdout: branchOut } = await execAsync("git rev-parse --abbrev-ref HEAD", {
        cwd: worktreePath,
      });
      const branch = branchOut.trim();

      const { stdout: commitOut } = await execAsync("git rev-parse HEAD", {
        cwd: worktreePath,
      });
      const headCommit = commitOut.trim();

      // 2. Check for uncommitted changes
      const { stdout: statusOut } = await execAsync("git status --porcelain", {
        cwd: worktreePath,
      });
      const lines = statusOut.split("\n").map((l) => l.trim()).filter(Boolean);
      const modifiedFiles = lines.map((l) => l.slice(3).trim());

      const hasUncommittedChanges = modifiedFiles.length > 0;
      const isDetached = branch === "HEAD";

      let status: "clean" | "diverged" | "detached" | "locked" = "clean";
      if (isDetached) {
        status = "detached";
      } else if (hasUncommittedChanges) {
        status = "diverged";
      }

      return {
        worktreePath,
        branch,
        headCommit,
        hasUncommittedChanges,
        modifiedFiles,
        status,
        detectedAt: now,
      };
    } catch {
      // Non-git directory or uninitialized
      return {
        worktreePath,
        hasUncommittedChanges: false,
        modifiedFiles: [],
        status: "clean",
        detectedAt: now,
      };
    }
  }

  public assertSafeOperation(record: WorktreeDivergenceRecord, operationName: string): void {
    if (record.hasUncommittedChanges && (operationName.includes("reset") || operationName.includes("clean") || operationName.includes("checkout"))) {
      throw new Error(
        `WORKTREE_DIVERGENCE_DETECTED: Worktree "${record.worktreePath}" contains ${record.modifiedFiles.length} uncommitted user modifications. Destructive operation "${operationName}" is prohibited.`
      );
    }
  }
}
