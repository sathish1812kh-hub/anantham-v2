import { describe, it, expect } from "vitest";
import { MultiDimensionalGrader, type RubricDimension } from "../../src/evaluation/multi-dimensional-grader.js";

describe("PRD-PART2-312: Model Output Quality Scoring & Multi-Dimensional Grading Rubric", () => {
  const grader = new MultiDimensionalGrader(70);

  it("calculates composite score and assigns letter grade 'A' for high scoring output", () => {
    const dimensions: RubricDimension[] = [
      { name: "Correctness", weight: 0.4, score: 95 },
      { name: "Security", weight: 0.3, score: 90 },
      { name: "Efficiency", weight: 0.2, score: 85 },
      { name: "Conciseness", weight: 0.1, score: 80 },
    ];
    // (95*0.4)+(90*0.3)+(85*0.2)+(80*0.1) = 38 + 27 + 17 + 8 = 90
    const grade = grader.gradeOutput(dimensions);
    expect(grade.compositeScore).toBe(90);
    expect(grade.letterGrade).toBe("A");
    expect(grade.passedThreshold).toBe(true);
  });

  it("assigns letter grade 'F' when output fails passing threshold", () => {
    const dimensions: RubricDimension[] = [
      { name: "Correctness", weight: 0.5, score: 40 },
      { name: "Security", weight: 0.5, score: 50 },
    ];
    // (40*0.5)+(50*0.5) = 45
    const grade = grader.gradeOutput(dimensions);
    expect(grade.compositeScore).toBe(45);
    expect(grade.letterGrade).toBe("F");
    expect(grade.passedThreshold).toBe(false);
  });
});
