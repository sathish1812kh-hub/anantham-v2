import { describe, it, expect } from "vitest";
import { SessionTreeVisualizer, type SessionBranchNode } from "../../src/tui/session-tree-visualizer.js";

describe("PRD-TUI-003: Session Branch Tree Visualization & Interactive Switcher", () => {
  const visualizer = new SessionTreeVisualizer();

  const branches: SessionBranchNode[] = [
    { id: "b_root", name: "main", createdAt: "2026-09-01", messageCount: 15 },
    { id: "b_feat", name: "feature/auth", parentBranchId: "b_root", createdAt: "2026-09-02", messageCount: 8 },
    { id: "b_sub", name: "oauth-google", parentBranchId: "b_feat", createdAt: "2026-09-02", messageCount: 4 },
    { id: "b_fix", name: "bugfix/token", parentBranchId: "b_root", createdAt: "2026-09-02", messageCount: 2 },
  ];

  it("renders hierarchical branch tree with active branch marker", () => {
    const rendered = visualizer.renderTree(branches, "b_feat");
    expect(rendered).toContain("Session Branch Hierarchy:");
    expect(rendered).toContain("main [b_root]");
    expect(rendered).toContain("feature/auth [b_feat] (8 msgs) * (active)");
    expect(rendered).toContain("oauth-google [b_sub]");
  });

  it("switches to target branch by name or ID", () => {
    const target = visualizer.switchBranch(branches, "oauth-google");
    expect(target).toBeDefined();
    expect(target?.id).toBe("b_sub");

    const targetById = visualizer.switchBranch(branches, "b_fix");
    expect(targetById?.name).toBe("bugfix/token");
  });
});
