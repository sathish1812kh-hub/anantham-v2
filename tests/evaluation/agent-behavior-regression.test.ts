import { describe, it, expect } from "vitest";
import { AgentBehaviorRegressionTester, type ToolCallStep } from "../../src/evaluation/agent-behavior-regression.js";

describe("PRD-PART2-313: Regression Testing Framework for Agent Behaviors & Tool Calling", () => {
  const tester = new AgentBehaviorRegressionTester();

  const goldenTrajectory: ToolCallStep[] = [
    { toolName: "view_file", action: "view" },
    { toolName: "replace_file_content", action: "edit" },
    { toolName: "run_command", action: "test" },
  ];

  it("passes when actual trajectory exactly matches golden sequence", () => {
    const actualTrajectory: ToolCallStep[] = [
      { toolName: "view_file", action: "view" },
      { toolName: "replace_file_content", action: "edit" },
      { toolName: "run_command", action: "test" },
    ];

    const res = tester.compareTrajectories(actualTrajectory, goldenTrajectory);
    expect(res.passed).toBe(true);
    expect(res.deviations.length).toBe(0);
  });

  it("detects tool sequence regressions and unexpected extra calls", () => {
    const deviatedTrajectory: ToolCallStep[] = [
      { toolName: "view_file", action: "view" },
      { toolName: "search_web", action: "search" }, // Unexpected tool
      { toolName: "replace_file_content", action: "edit" },
    ];

    const res = tester.compareTrajectories(deviatedTrajectory, goldenTrajectory);
    expect(res.passed).toBe(false);
    expect(res.deviations.some((d) => d.includes("Step 2 tool mismatch"))).toBe(true);
  });
});
