import {
  type EvaluationRun,
  type RegressionComparison,
  RegressionComparisonSchema,
} from "../domain/evaluation.js";

/**
 * Regression Comparison Engine.
 * PRD Part 3 Section 98.
 */
export class RegressionEngine {
  /**
   * Compare a current evaluation run against a prior baseline run.
   */
  public static compare(
    baseline: EvaluationRun,
    current: EvaluationRun
  ): RegressionComparison {
    if (baseline.datasetId !== current.datasetId) {
      throw new Error(
        `Cannot compare runs across different datasets: '${baseline.datasetId}' vs '${current.datasetId}'`
      );
    }

    const baselineCaseMap = new Map(baseline.results.map((r) => [r.caseId, r]));
    const newFailures: string[] = [];
    const fixedFailures: string[] = [];
    const unchangedFailures: string[] = [];

    for (const currRes of current.results) {
      const baseRes = baselineCaseMap.get(currRes.caseId);
      if (!baseRes) continue;

      const basePassed = baseRes.status === "PASS";
      const currPassed = currRes.status === "PASS";

      if (basePassed && !currPassed) {
        newFailures.push(currRes.caseId);
      } else if (!basePassed && currPassed) {
        fixedFailures.push(currRes.caseId);
      } else if (!basePassed && !currPassed) {
        unchangedFailures.push(currRes.caseId);
      }
    }

    const scoreDelta = Math.round((current.summary.overallScore - baseline.summary.overallScore) * 100) / 100;
    const regressionDetected = newFailures.length > 0 || scoreDelta < 0;

    return RegressionComparisonSchema.parse({
      baselineRunId: baseline.id,
      currentRunId: current.id,
      datasetId: current.datasetId,
      scoreDelta,
      newFailures,
      fixedFailures,
      unchangedFailures,
      regressionDetected,
    });
  }
}
