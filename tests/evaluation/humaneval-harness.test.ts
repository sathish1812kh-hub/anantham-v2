import { describe, it, expect } from "vitest";
import { HumanEvalHarness, type HumanEvalTask } from "../../src/evaluation/humaneval-harness.js";

describe("PRD-EVAL-003: HumanEval & Coding Benchmark Harness", () => {
  const harness = new HumanEvalHarness();

  const mockTask: HumanEvalTask = {
    taskId: "HumanEval/0",
    prompt: "function hasCloseElements(numbers, threshold) {",
    entryPoint: "hasCloseElements",
    test: "if (!hasCloseElements([1.0, 2.0, 3.9, 4.0], 0.2)) throw new Error('Assertion failed');",
  };

  it("evaluates correct functional implementation passing test assertion", () => {
    const validCompletion = `
function hasCloseElements(numbers, threshold) {
  for (let i = 0; i < numbers.length; i++) {
    for (let j = i + 1; j < numbers.length; j++) {
      if (Math.abs(numbers[i] - numbers[j]) < threshold) return true;
    }
  }
  return false;
}
`;

    const res = harness.evaluateTask(mockTask, validCompletion);
    expect(res.passed).toBe(true);
  });

  it("detects incorrect functional implementation failing test assertion", () => {
    const brokenCompletion = `
function hasCloseElements(numbers, threshold) {
  return false; // Wrong implementation
}
`;

    const res = harness.evaluateTask(mockTask, brokenCompletion);
    expect(res.passed).toBe(false);
    expect(res.error).toContain("Assertion failed");
  });

  it("calculates pass@1 rate across evaluated instances", () => {
    const results = [
      { taskId: "task_1", passed: true, completion: "" },
      { taskId: "task_2", passed: true, completion: "" },
      { taskId: "task_3", passed: false, completion: "" },
      { taskId: "task_4", passed: true, completion: "" },
    ];
    const rate = harness.calculatePassAt1(results);
    expect(rate).toBe(0.75);
  });
});
