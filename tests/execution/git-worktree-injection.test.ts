import { describe, it, expect, beforeEach } from "vitest";
import { GitWorktreeManager } from "../../src/execution/git-worktree-manager.js";

describe("W-P10.6-02: Git Worktree Shell Argument Injection Prevention", () => {
  let worktreeManager: GitWorktreeManager;

  beforeEach(() => {
    worktreeManager = new GitWorktreeManager({ projectRoot: process.cwd() });
  });

  it("rejects malicious branch names with shell metacharacters and escapes", async () => {
    const dangerousBranches = [
      "feat; rm -rf /",
      "feat && echo pwned",
      "feat | cat /etc/passwd",
      "feat\" -f \"evil",
      "--upload-pack=evil",
      "-b evil",
      "feat$(whoami)",
      "feat`id`",
      "feat/../escape",
    ];

    for (const branch of dangerousBranches) {
      await expect(
        worktreeManager.createWorktree("ws_test", branch, "HEAD")
      ).rejects.toThrow("SECURITY_INVALID_REF");
    }
  });

  it("rejects dangerous baseCommit refs with shell metacharacters", async () => {
    const dangerousCommits = [
      "HEAD; whoami",
      "--help",
      "HEAD & echo pwned",
      "HEAD\" --option",
    ];

    for (const commit of dangerousCommits) {
      await expect(
        worktreeManager.createWorktree("ws_test", "valid-feature-branch", commit)
      ).rejects.toThrow("SECURITY_INVALID_REF");
    }
  });
});
