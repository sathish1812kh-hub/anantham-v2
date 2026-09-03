import { describe, it, expect } from "vitest";
import { TuiDashboard } from "../../src/tui/tui-dashboard.js";

describe("PRD-TUI-001: Text User Interface (TUI) Dashboard", () => {
  it("renders header, status bar, and model/session state cleanly", () => {
    const dashboard = new TuiDashboard({
      sessionId: "sess_main_1",
      activeModel: "gemini-2.5-pro",
      activeBranch: "feature/auth",
      tokenCount: 45000,
      costUsd: 0.125,
      status: "running",
    });

    const header = dashboard.renderHeader(80);
    expect(header).toContain("ANANTHAM V2 — OPERATING DASHBOARD");

    const statusBar = dashboard.renderStatusBar(80);
    expect(statusBar).toContain("STATUS: [RUNNING]");
    expect(statusBar).toContain("SESSION: sess_main_1");
    expect(statusBar).toContain("MODEL: gemini-2.5-pro");
    expect(statusBar).toContain("TOKENS: 45,000");

    const fullView = dashboard.renderFullView(80);
    expect(fullView).toContain("OPERATING DASHBOARD");
    expect(fullView).toContain("gemini-2.5-pro");
  });
});
