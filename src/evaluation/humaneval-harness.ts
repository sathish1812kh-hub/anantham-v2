/**
 * HumanEval & Coding Benchmark Harness
 * PRD-EVAL-003: HumanEval & Coding Benchmark Harness
 */

export interface HumanEvalTask {
  taskId: string;
  prompt: string;
  entryPoint: string;
  test: string; // Python/JS assertions
}

export interface HumanEvalResult {
  taskId: string;
  passed: boolean;
  completion: string;
  error?: string;
}

export class HumanEvalHarness {
  public evaluateTask(
    task: HumanEvalTask,
    completion: string,
    evaluatorMock?: (entryPoint: string, code: string, testCode: string) => boolean
  ): HumanEvalResult {
    try {
      if (evaluatorMock) {
        const passed = evaluatorMock(task.entryPoint, completion, task.test);
        return { taskId: task.taskId, passed, completion };
      }

      // Safe lightweight evaluation for JS/TS functional tests
      const fullCode = `${completion}\n${task.test}`;
      let passed = false;

      // Deterministic verification using sandbox execution function
      try {
        const runFn = new Function(fullCode);
        runFn();
        passed = true;
      } catch (err) {
        return {
          taskId: task.taskId,
          passed: false,
          completion,
          error: err instanceof Error ? err.message : String(err),
        };
      }

      return { taskId: task.taskId, passed, completion };
    } catch (err) {
      return {
        taskId: task.taskId,
        passed: false,
        completion,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  public calculatePassAt1(results: HumanEvalResult[]): number {
    if (results.length === 0) return 0;
    const passed = results.filter((r) => r.passed).length;
    return Number((passed / results.length).toFixed(4));
  }
}
