/**
 * Core Evaluation Engine & Test Harness Runner
 * PRD-EVAL-001: Core Evaluation Engine Architecture & Test Harness
 */

export interface TestCase {
  id: string;
  input: string;
  expectedOutput?: string;
  validator?: (actual: string) => boolean;
  metadata?: Record<string, unknown>;
}

export interface TestCaseResult {
  testCaseId: string;
  passed: boolean;
  durationMs: number;
  actualOutput: string;
  error?: string;
}

export interface BenchmarkEvaluationReport {
  benchmarkName: string;
  totalTests: number;
  passedCount: number;
  failedCount: number;
  passRate: number;
  averageDurationMs: number;
  results: TestCaseResult[];
}

export class CoreEvaluationEngine {
  public async runBenchmark(
    benchmarkName: string,
    testCases: TestCase[],
    runner: (input: string) => Promise<string> | string
  ): Promise<BenchmarkEvaluationReport> {
    const results: TestCaseResult[] = [];
    let totalDuration = 0;

    for (const tc of testCases) {
      const start = Date.now();
      try {
        const actual = await runner(tc.input);
        const durationMs = Date.now() - start;
        totalDuration += durationMs;

        let passed = false;
        if (tc.validator) {
          passed = tc.validator(actual);
        } else if (tc.expectedOutput !== undefined) {
          passed = actual.trim() === tc.expectedOutput.trim();
        }

        results.push({
          testCaseId: tc.id,
          passed,
          durationMs,
          actualOutput: actual,
        });
      } catch (err) {
        const durationMs = Date.now() - start;
        totalDuration += durationMs;
        const errorMsg = err instanceof Error ? err.message : String(err);
        results.push({
          testCaseId: tc.id,
          passed: false,
          durationMs,
          actualOutput: "",
          error: errorMsg,
        });
      }
    }

    const passedCount = results.filter((r) => r.passed).length;
    const totalTests = results.length;
    const passRate = totalTests > 0 ? Number((passedCount / totalTests).toFixed(4)) : 0;
    const averageDurationMs = totalTests > 0 ? Math.round(totalDuration / totalTests) : 0;

    return {
      benchmarkName,
      totalTests,
      passedCount,
      failedCount: totalTests - passedCount,
      passRate,
      averageDurationMs,
      results,
    };
  }
}
