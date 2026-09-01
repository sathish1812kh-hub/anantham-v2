import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";
import * as fs from "node:fs";

const execAsync = promisify(exec);

export interface GitWorkingTreeStatus {
  branch: string;
  headCommit: string;
  isClean: boolean;
  modifiedFiles: string[];
  untrackedFiles: string[];
}

export interface GitWorktreeManagerOptions {
  projectRoot?: string;
}

/**
 * Git Worktree Manager for isolated parallel execution.
 * Enforces path safety, base revision verification, dirty-tree detection,
 * and user change preservation.
 * PRD Part 2 Section 52, Playbook Section 138.
 */
export class GitWorktreeManager {
  private readonly projectRoot: string;

  constructor(options: GitWorktreeManagerOptions = {}) {
    this.projectRoot = path.resolve(options.projectRoot || process.cwd());
  }

  /**
   * Get the safe worktree directory for a workspace ID.
   */
  public getWorktreePath(workspaceId: string, customRoot?: string): string {
    if (workspaceId.includes("..") || workspaceId.includes("/") || workspaceId.includes("\\")) {
      throw new Error(`SECURITY_PATH_TRAVERSAL: Workspace ID "${workspaceId}" contains invalid traversal characters.`);
    }
    const root = customRoot ? path.resolve(customRoot) : this.projectRoot;
    const sanitizedId = workspaceId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const targetDir = path.join(root, ".anantham", "worktrees", sanitizedId);
    
    // Path traversal defense
    const rel = path.relative(root, targetDir);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error(`SECURITY_PATH_TRAVERSAL: Worktree path "${targetDir}" escapes project root "${root}"`);
    }
    return targetDir;
  }

  /**
   * Inspect current repository working tree status.
   */
  public async inspectWorkingTree(repoPath: string = this.projectRoot): Promise<GitWorkingTreeStatus> {
    try {
      const { stdout: branchOut } = await execAsync("git rev-parse --abbrev-ref HEAD", { cwd: repoPath });
      const branch = branchOut.trim();

      const { stdout: commitOut } = await execAsync("git rev-parse HEAD", { cwd: repoPath });
      const headCommit = commitOut.trim();

      const { stdout: statusOut } = await execAsync("git status --porcelain", { cwd: repoPath });
      const lines = statusOut.split("\n").map((l) => l.trim()).filter(Boolean);

      const modifiedFiles: string[] = [];
      const untrackedFiles: string[] = [];

      for (const line of lines) {
        const flag = line.slice(0, 2);
        const file = line.slice(3).trim();
        const normalized = file.replace(/\\/g, "/");
        if (normalized.startsWith(".anantham/") || normalized === ".anantham") {
          continue;
        }
        if (flag === "??") {
          untrackedFiles.push(file);
        } else {
          modifiedFiles.push(file);
        }
      }

      return {
        branch,
        headCommit,
        isClean: modifiedFiles.length === 0 && untrackedFiles.length === 0,
        modifiedFiles,
        untrackedFiles,
      };
    } catch (err: any) {
      throw new Error(`GIT_INSPECTION_FAILED: Failed to inspect git status at "${repoPath}": ${err.message}`);
    }
  }

  /**
   * Assert that target repository is clean before any destructive or integration operation.
   * Playbook Section 138.
   */
  public async assertCleanWorkingTree(repoPath: string = this.projectRoot, operationName: string = "integration"): Promise<void> {
    const status = await this.inspectWorkingTree(repoPath);
    if (!status.isClean) {
      throw new Error(
        `USER_WORK_PROTECTION_VIOLATION: Repository at "${repoPath}" contains ${status.modifiedFiles.length} modified files and ${status.untrackedFiles.length} untracked files. Operation "${operationName}" is prohibited to prevent overwriting user modifications.`
      );
    }
  }

  /**
   * Create an isolated Git worktree for an agent.
   */
  public async createWorktree(
    workspaceId: string,
    branchName: string,
    baseCommit: string,
    repoPath: string = this.projectRoot
  ): Promise<{ worktreePath: string; branchName: string; baseCommit: string }> {
    const worktreePath = this.getWorktreePath(workspaceId, repoPath);

    // Ensure parent dir exists
    fs.mkdirSync(path.dirname(worktreePath), { recursive: true });

    // Verify base commit exists
    try {
      await execAsync(`git rev-parse --verify "${baseCommit}"`, { cwd: repoPath });
    } catch {
      throw new Error(`INVALID_BASE_COMMIT: Commit "${baseCommit}" does not exist in repository "${repoPath}"`);
    }

    // Create worktree on a new branch starting from baseCommit
    try {
      await execAsync(`git worktree add -b "${branchName}" "${worktreePath}" "${baseCommit}"`, {
        cwd: repoPath,
      });
    } catch (err: any) {
      throw new Error(`WORKTREE_CREATION_FAILED: Failed to create worktree at "${worktreePath}": ${err.message}`);
    }

    return {
      worktreePath,
      branchName,
      baseCommit,
    };
  }

  /**
   * Safely remove a Git worktree.
   */
  public async removeWorktree(
    worktreePath: string,
    repoPath: string = this.projectRoot,
    force: boolean = false
  ): Promise<boolean> {
    try {
      if (!fs.existsSync(worktreePath)) {
        return true;
      }

      // Check if worktree contains uncommitted modifications unless force is explicitly set
      if (!force) {
        const status = await this.inspectWorkingTree(worktreePath);
        if (!status.isClean) {
          throw new Error(
            `WORKTREE_HAS_UNCOMMITTED_CHANGES: Cannot remove worktree "${worktreePath}" containing uncommitted modifications.`
          );
        }
      }

      await execAsync(`git worktree remove --force "${worktreePath}"`, { cwd: repoPath });
      await execAsync("git worktree prune", { cwd: repoPath });
      return true;
    } catch (err: any) {
      if (err.message?.includes("WORKTREE_HAS_UNCOMMITTED_CHANGES")) {
        throw err;
      }
      // Fallback manual cleanup if git worktree remove encounters detached state
      try {
        fs.rmSync(worktreePath, { recursive: true, force: true });
        await execAsync("git worktree prune", { cwd: repoPath });
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * List active Git worktrees.
   */
  public async listWorktrees(repoPath: string = this.projectRoot): Promise<string[]> {
    try {
      const { stdout } = await execAsync("git worktree list --porcelain", { cwd: repoPath });
      const worktrees: string[] = [];
      const lines = stdout.split("\n");
      for (const line of lines) {
        if (line.startsWith("worktree ")) {
          worktrees.push(line.slice(9).trim());
        }
      }
      return worktrees;
    } catch {
      return [];
    }
  }
}
