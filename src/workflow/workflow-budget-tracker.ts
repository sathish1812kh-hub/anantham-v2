import {
  type WorkflowBudget,
  type WorkflowBudgetConsumption,
  type WorkflowConcurrency,
} from "../domain/workflow.js";

export interface BudgetCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Hierarchical Workflow Budget & Concurrency Tracker.
 * PRD Part 2 Section 118 & 161.
 * Effective Limit = min(workflow limit, agent limit, team limit, global runtime limit).
 */
export class WorkflowBudgetTracker {
  constructor(
    private readonly budget?: WorkflowBudget,
    private readonly concurrency?: WorkflowConcurrency
  ) {}

  /**
   * Check whether a proposed token consumption is within limits.
   */
  public checkTokenBudget(current: WorkflowBudgetConsumption, additionalTokens: number): BudgetCheckResult {
    if (!this.budget?.maxTokens) return { allowed: true };
    const projected = current.tokens + additionalTokens;
    if (projected > this.budget.maxTokens) {
      return {
        allowed: false,
        reason: `Token budget exceeded: projected ${projected} tokens exceeds maximum limit of ${this.budget.maxTokens}.`,
      };
    }
    return { allowed: true };
  }

  /**
   * Check whether execution duration is within limits.
   */
  public checkDurationBudget(startTimeIso: string): BudgetCheckResult {
    if (!this.budget?.maxDurationMs) return { allowed: true };
    const elapsed = Date.now() - new Date(startTimeIso).getTime();
    if (elapsed > this.budget.maxDurationMs) {
      return {
        allowed: false,
        reason: `Workflow duration exceeded: elapsed ${elapsed}ms exceeds maximum allowed ${this.budget.maxDurationMs}ms.`,
      };
    }
    return { allowed: true };
  }

  /**
   * Check whether cost budget is within limits.
   */
  public checkCostBudget(current: WorkflowBudgetConsumption, additionalCostUsd: number): BudgetCheckResult {
    if (!this.budget?.maxCostUsd) return { allowed: true };
    const projected = current.costUsd + additionalCostUsd;
    if (projected > this.budget.maxCostUsd) {
      return {
        allowed: false,
        reason: `Cost budget exceeded: projected $${projected.toFixed(4)} exceeds maximum limit of $${this.budget.maxCostUsd.toFixed(4)}.`,
      };
    }
    return { allowed: true };
  }

  /**
   * Check active parallel concurrency bounds.
   */
  public checkConcurrency(activeTasksCount: number): BudgetCheckResult {
    const maxTasks = this.concurrency?.maxParallelTasks ?? 8;
    if (activeTasksCount >= maxTasks) {
      return {
        allowed: false,
        reason: `Parallel concurrency limit reached: ${activeTasksCount} active tasks (max: ${maxTasks}).`,
      };
    }
    return { allowed: true };
  }

  /**
   * Records newly consumed tokens, cost, duration, and tool calls.
   */
  public recordConsumption(
    current: WorkflowBudgetConsumption,
    delta: { tokens?: number; costUsd?: number; durationMs?: number; toolCalls?: number }
  ): WorkflowBudgetConsumption {
    return {
      tokens: current.tokens + (delta.tokens || 0),
      costUsd: current.costUsd + (delta.costUsd || 0),
      durationMs: current.durationMs + (delta.durationMs || 0),
      toolCalls: current.toolCalls + (delta.toolCalls || 0),
    };
  }
}
