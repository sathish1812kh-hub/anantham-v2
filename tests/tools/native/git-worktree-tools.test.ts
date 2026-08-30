import { describe, it, expect } from "vitest";
import { createGitTools } from "../../../src/tools/native/git-tools.js";

describe("P4.3 Native Git & Worktree Tools", () => {
  it("queries git status, log, and worktrees in the current repo", async () => {
    const [gitStatus, , gitLog, , worktreeList] = createGitTools();

    const statusRes = (await gitStatus.handler(
      {},
      { callId: "g1", actor: { id: "a1", type: "agent" }, project: { id: "p1" } }
    )) as any;
    expect(typeof statusRes.clean).toBe("boolean");

    const logRes = (await gitLog.handler(
      { maxCount: 3 },
      { callId: "g2", actor: { id: "a1", type: "agent" }, project: { id: "p1" } }
    )) as any;
    expect(Array.isArray(logRes.commits)).toBe(true);
    expect(logRes.commits.length).toBeGreaterThan(0);

    const wtRes = (await worktreeList.handler(
      {},
      { callId: "g3", actor: { id: "a1", type: "agent" }, project: { id: "p1" } }
    )) as any;
    expect(Array.isArray(wtRes.worktrees)).toBe(true);
    expect(wtRes.worktrees.length).toBeGreaterThan(0);
  });
});
