/**
 * Model Output Quality Scoring & Multi-Dimensional Grading Rubric
 * PRD-PART2-312: Model Output Quality Scoring & Multi-Dimensional Grading Rubric
 */

export interface RubricDimension {
  name: string;
  weight: number; // 0.0 to 1.0, sum of weights = 1.0
  score: number;  // 0 to 100
  critique?: string;
}

export interface EvaluationGrade {
  compositeScore: number; // 0 to 100
  letterGrade: "A" | "B" | "C" | "D" | "F";
  dimensions: RubricDimension[];
  passedThreshold: boolean;
}

export class MultiDimensionalGrader {
  private passingThreshold: number;

  constructor(passingThreshold = 70) {
    this.passingThreshold = passingThreshold;
  }

  public gradeOutput(dimensions: RubricDimension[]): EvaluationGrade {
    let compositeScore = 0;
    let totalWeight = 0;

    for (const dim of dimensions) {
      compositeScore += dim.score * dim.weight;
      totalWeight += dim.weight;
    }

    if (totalWeight > 0 && Math.abs(totalWeight - 1.0) > 0.001) {
      compositeScore = compositeScore / totalWeight; // Normalize if weights don't sum to 1
    }

    compositeScore = Math.round(compositeScore);

    let letterGrade: EvaluationGrade["letterGrade"] = "F";
    if (compositeScore >= 90) letterGrade = "A";
    else if (compositeScore >= 80) letterGrade = "B";
    else if (compositeScore >= 70) letterGrade = "C";
    else if (compositeScore >= 60) letterGrade = "D";

    return {
      compositeScore,
      letterGrade,
      dimensions,
      passedThreshold: compositeScore >= this.passingThreshold,
    };
  }
}
