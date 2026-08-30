import { describe, it, expect } from "vitest";
import { WorktreeDivergenceDetector } from "../../src/side-effects/worktree-divergence-detector.js";

describe("P4.5 Worktree Divergence Detector — Git Drift & Reset Guards", () => {
  const detector = new WorktreeDivergenceDetector();

  it("inspects current repository worktree state safely", async () => {
    const record = await detector.inspect(process.cwd());
    expect(record.worktreePath).toBe(process.cwd());
    expect(record.status).toBeDefined();
  });

  it("asserts safety and blocks destructive operations when uncommitted user modifications exist", () => {
    const dirtyRecord = {
      worktreePath: "C:/project",
      branch: "main",
      hasUncommittedChanges: true,
      modifiedFiles: ["src/critical.ts"],
      status: "diverged" as const,
      detectedAt: new Date().toISOString(),
    };

    expect(() =>
      detector.assertSafeOperation(dirtyRecord, "git reset --hard")
    ).toThrow(/WORKTREE_DIVERGENCE_DETECTED/);

    expect(() =>
      detector.assertSafeOperation(dirtyRecord, "git clean -fd")
    ).toThrow(/WORKTREE_DIVERGENCE_DETECTED/);
  });
});
