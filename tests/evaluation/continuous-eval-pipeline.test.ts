import { describe, it, expect } from "vitest";
import { ContinuousEvalPipeline } from "../../src/evaluation/continuous-eval-pipeline.js";

describe("PRD-EVAL-006: Continuous Evaluation & Regression Detection Pipeline", () => {
  it("establishes baseline, accepts minor variance within tolerance, and detects critical drop", () => {
    const pipeline = new ContinuousEvalPipeline(0.02); // 2% drop allowed

    // 1. Establish baseline at 0.85
    const initRun = pipeline.evaluateRun("SWE-bench", 0.85);
    expect(initRun.passed).toBe(true);
    expect(initRun.baselineScore).toBe(0.85);

    // 2. Acceptable slight drop (-0.01 within 0.02)
    const validRun = pipeline.evaluateRun("SWE-bench", 0.84);
    expect(validRun.passed).toBe(true);
    expect(validRun.delta).toBe(-0.01);

    // 3. Regression drop (-0.05 exceeds 0.02)
    const regressedRun = pipeline.evaluateRun("SWE-bench", 0.80);
    expect(regressedRun.passed).toBe(false);
    expect(regressedRun.message).toContain("Benchmark regression detected");
  });
});
