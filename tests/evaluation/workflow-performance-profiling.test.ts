import { describe, it, expect } from "vitest";
import { WorkflowProfiler } from "../../src/evaluation/workflow-profiler.js";

describe("PRD-PART2-314: Performance Profiling & Bottleneck Analyzer for Multi-Agent Workflows", () => {
  const profiler = new WorkflowProfiler();

  it("profiles agent spans, calculates parallel efficiency, and identifies primary bottleneck", () => {
    const start = 1000;
    const end = 3000; // 2000ms total workflow duration

    profiler.recordSpan("planner_agent", "plan_decomposition", 1000, 1500); // 500ms
    profiler.recordSpan("coder_agent", "write_code", 1500, 2700); // 1200ms (bottleneck)
    profiler.recordSpan("reviewer_agent", "code_review", 2700, 3000); // 300ms

    const report = profiler.analyzeProfile(start, end);
    expect(report.totalDurationMs).toBe(2000);
    expect(report.cumulativeAgentDurationMs).toBe(2000);
    expect(report.criticalPathSpan.agentId).toBe("coder_agent");
    expect(report.criticalPathSpan.durationMs).toBe(1200);
    expect(report.bottlenecks[0]!.percentOfTotal).toBe(60.0);
  });
});
