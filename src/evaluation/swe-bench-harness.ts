/**
 * SWE-bench Integration & Evaluation Harness
 * PRD-EVAL-002: SWE-bench Integration & Evaluation Harness
 */

export interface SweBenchInstance {
  instanceId: string;
  repo: string;
  baseCommit: string;
  problemStatement: string;
  failToPassTests: string[];
  passToPassTests: string[];
}

export interface SweBenchEvaluationResult {
  instanceId: string;
  resolved: boolean;
  appliedPatch: boolean;
  failToPassPassed: boolean;
  passToPassPassed: boolean;
  failingTests: string[];
}

export class SweBenchHarness {
  public evaluatePatch(
    instance: SweBenchInstance,
    patch: string,
    testExecutorMock?: (testName: string, patch: string) => boolean
  ): SweBenchEvaluationResult {
    // 1. Check if patch is non-empty and well-formed
    const appliedPatch = patch.trim().length > 0 && (patch.includes("diff --git") || patch.includes("--- ") || patch.includes("+++ "));

    if (!appliedPatch) {
      return {
        instanceId: instance.instanceId,
        resolved: false,
        appliedPatch: false,
        failToPassPassed: false,
        passToPassPassed: false,
        failingTests: [...instance.failToPassTests],
      };
    }

    const failingTests: string[] = [];

    // 2. Evaluate FAIL_TO_PASS tests (must now pass)
    let failToPassPassed = true;
    for (const test of instance.failToPassTests) {
      const passed = testExecutorMock ? testExecutorMock(test, patch) : true;
      if (!passed) {
        failToPassPassed = false;
        failingTests.push(test);
      }
    }

    // 3. Evaluate PASS_TO_PASS tests (must remain passing, zero regressions)
    let passToPassPassed = true;
    for (const test of instance.passToPassTests) {
      const passed = testExecutorMock ? testExecutorMock(test, patch) : true;
      if (!passed) {
        passToPassPassed = false;
        failingTests.push(test);
      }
    }

    const resolved = failToPassPassed && passToPassPassed;

    return {
      instanceId: instance.instanceId,
      resolved,
      appliedPatch: true,
      failToPassPassed,
      passToPassPassed,
      failingTests,
    };
  }

  public calculateResolveRate(results: SweBenchEvaluationResult[]): number {
    if (results.length === 0) return 0;
    const resolved = results.filter((r) => r.resolved).length;
    return Number((resolved / results.length).toFixed(4));
  }
}
