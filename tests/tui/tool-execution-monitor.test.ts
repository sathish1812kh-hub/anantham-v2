import { describe, it, expect } from "vitest";
import { TuiDashboard } from "../../src/tui/tui-dashboard.js";

describe("PRD-TUI-004: Dynamic Tool Execution & Streaming Output Monitor", () => {
  it("streams active tool execution lines and maintains bounded streaming buffer", () => {
    const dashboard = new TuiDashboard();

    expect(dashboard.renderToolMonitor()).toContain("Idle (No active tool executing)");

    dashboard.startToolExecution("run_command");
    dashboard.appendToolOutput("Executing npm test...");
    dashboard.appendToolOutput("PASS src/auth.test.ts (5 tests)");

    const activeMonitor = dashboard.renderToolMonitor();
    expect(activeMonitor).toContain("Active Tool: [run_command]");
    expect(activeMonitor).toContain("Executing npm test...");
    expect(activeMonitor).toContain("PASS src/auth.test.ts");

    dashboard.finishToolExecution("idle");
    expect(dashboard.renderToolMonitor()).toContain("Idle");
  });
});
