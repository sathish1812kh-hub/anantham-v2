import { describe, it, expect } from "vitest";
import { AntiContaminationGuard } from "../../src/evaluation/anti-contamination-guard.js";

describe("PRD-INV-005: Evaluation Integrity & Anti-Contamination Invariants", () => {
  const guard = new AntiContaminationGuard();

  const secretHumanEvalSamples = [
    "def has_close_elements(numbers: List[float], threshold: float) -> bool:",
    "def separate_paren_groups(paren_string: str) -> List[str]:",
  ];

  guard.registerBenchmarkDataset("HumanEval", secretHumanEvalSamples);

  it("detects contamination when evaluation context leaks benchmark test samples", () => {
    const leakyPrompt = "def has_close_elements(numbers: List[float], threshold: float) -> bool:";
    const check = guard.detectContamination("HumanEval", leakyPrompt);

    expect(check.contaminated).toBe(true);
    expect(check.reason).toContain("Exact test sample leakage detected");
  });

  it("allows non-contaminated prompts without false positives", () => {
    const cleanPrompt = "def calculate_sum(a: int, b: int) -> int:";
    const check = guard.detectContamination("HumanEval", cleanPrompt);

    expect(check.contaminated).toBe(false);
  });
});
