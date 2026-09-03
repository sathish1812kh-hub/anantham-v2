import { describe, it, expect } from "vitest";
import { CoreEvaluationEngine, type TestCase } from "../../src/evaluation/eval-engine.js";

describe("PRD-EVAL-001: Core Evaluation Engine Architecture & Test Harness", () => {
  const engine = new CoreEvaluationEngine();

  it("runs benchmark test cases and aggregates pass rate, failures, and latency", async () => {
    const testCases: TestCase[] = [
      { id: "tc_1", input: "hello", expectedOutput: "HELLO" },
      { id: "tc_2", input: "world", expectedOutput: "WORLD" },
      { id: "tc_3", input: "error", expectedOutput: "ERROR" },
    ];

    const report = await engine.runBenchmark("StringUpperBenchmark", testCases, (input) => {
      if (input === "error") throw new Error("Processing failed");
      return input.toUpperCase();
    });

    expect(report.benchmarkName).toBe("StringUpperBenchmark");
    expect(report.totalTests).toBe(3);
    expect(report.passedCount).toBe(2);
    expect(report.failedCount).toBe(1);
    expect(report.passRate).toBe(0.6667);
    expect(report.results[2]?.error).toBe("Processing failed");
  });
});
