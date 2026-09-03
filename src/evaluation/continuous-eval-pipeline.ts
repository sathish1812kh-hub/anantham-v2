/**
 * Continuous Evaluation & Regression Detection Pipeline
 * PRD-EVAL-006: Continuous Evaluation & Regression Detection Pipeline
 */

export interface BenchmarkScoreRecord {
  benchmarkName: string;
  score: number; // 0.0 to 1.0 (or absolute score)
  commitHash: string;
  timestamp: string;
}

export interface RegressionCheckResult {
  passed: boolean;
  benchmarkName: string;
  currentScore: number;
  baselineScore: number;
  delta: number;
  maxAllowedDrop: number;
  message: string;
}

export class ContinuousEvalPipeline {
  private baselines: Map<string, number> = new Map();
  private maxAllowedDrop: number; // e.g. 0.02 (2% max drop)

  constructor(maxAllowedDrop = 0.02) {
    this.maxAllowedDrop = maxAllowedDrop;
  }

  public setBaseline(benchmarkName: string, baselineScore: number): void {
    this.baselines.set(benchmarkName, baselineScore);
  }

  public evaluateRun(benchmarkName: string, currentScore: number): RegressionCheckResult {
    const baseline = this.baselines.get(benchmarkName);

    if (baseline === undefined) {
      // First run becomes the baseline
      this.baselines.set(benchmarkName, currentScore);
      return {
        passed: true,
        benchmarkName,
        currentScore,
        baselineScore: currentScore,
        delta: 0,
        maxAllowedDrop: this.maxAllowedDrop,
        message: `Baseline established at ${currentScore} for '${benchmarkName}'.`,
      };
    }

    const delta = Number((currentScore - baseline).toFixed(4));
    const passed = delta >= -this.maxAllowedDrop;

    return {
      passed,
      benchmarkName,
      currentScore,
      baselineScore: baseline,
      delta,
      maxAllowedDrop: this.maxAllowedDrop,
      message: passed
        ? `Score passed regression gate: ${currentScore} vs baseline ${baseline} (delta: ${delta >= 0 ? "+" : ""}${delta})`
        : `CRITICAL: Benchmark regression detected! Current: ${currentScore}, Baseline: ${baseline}, Drop: ${delta} exceeds tolerance -${this.maxAllowedDrop}`,
    };
  }
}
