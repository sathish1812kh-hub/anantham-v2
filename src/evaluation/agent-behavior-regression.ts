/**
 * Regression Testing Framework for Agent Behaviors & Tool Calling
 * PRD-PART2-313: Regression Testing Framework for Agent Behaviors & Tool Calling
 */

export interface ToolCallStep {
  toolName: string;
  action?: string;
  arguments?: Record<string, unknown>;
}

export interface TrajectoryComparison {
  passed: boolean;
  expectedStepCount: number;
  actualStepCount: number;
  deviations: string[];
}

export class AgentBehaviorRegressionTester {
  public compareTrajectories(
    actual: ToolCallStep[],
    golden: ToolCallStep[],
    strictOrder = true
  ): TrajectoryComparison {
    const deviations: string[] = [];

    if (strictOrder) {
      const maxLen = Math.max(actual.length, golden.length);
      for (let i = 0; i < maxLen; i++) {
        const act = actual[i];
        const gold = golden[i];

        if (!gold && act) {
          deviations.push(`Unexpected extra tool call at step ${i + 1}: '${act.toolName}'`);
        } else if (!act && gold) {
          deviations.push(`Missing expected tool call at step ${i + 1}: '${gold.toolName}'`);
        } else if (act && gold) {
          if (act.toolName !== gold.toolName) {
            deviations.push(`Step ${i + 1} tool mismatch: expected '${gold.toolName}', got '${act.toolName}'`);
          }
          if (gold.action && act.action !== gold.action) {
            deviations.push(`Step ${i + 1} action mismatch: expected '${gold.action}', got '${act.action}'`);
          }
        }
      }
    } else {
      // Non-strict order: check set containment
      for (const gold of golden) {
        if (!actual.some((act) => act.toolName === gold.toolName)) {
          deviations.push(`Missing required tool call: '${gold.toolName}'`);
        }
      }
    }

    return {
      passed: deviations.length === 0,
      expectedStepCount: golden.length,
      actualStepCount: actual.length,
      deviations,
    };
  }
}
