import {
  type RetryBudgetConfig,
  type RetryBudgetUsage,
  RetryBudgetConfigSchema,
} from "../domain/side-effect.js";

/**
 * Anantham V2 — Hierarchical Retry Budget Manager
 * PRD Part 1 Section 85 & PRD Part 2 Section 242-243
 */
export class RetryBudgetManager {
  private readonly config: RetryBudgetConfig;
  private globalRetryCount = 0;
  private readonly taskRetryCounts = new Map<string, number>();
  private readonly operationRetryCounts = new Map<string, number>();

  constructor(config: Partial<RetryBudgetConfig> = {}) {
    this.config = RetryBudgetConfigSchema.parse(config);
  }

  public getUsage(taskId = "global", operationKey = "default"): RetryBudgetUsage {
    return {
      globalRetries: this.globalRetryCount,
      taskRetries: this.taskRetryCounts.get(taskId) || 0,
      operationRetries: this.operationRetryCounts.get(operationKey) || 0,
    };
  }

  public canRetry(taskId = "global", operationKey = "default"): boolean {
    const usage = this.getUsage(taskId, operationKey);

    if (usage.globalRetries >= this.config.maxGlobalRetries) {
      return false;
    }
    if (usage.taskRetries >= this.config.maxTaskRetries) {
      return false;
    }
    if (usage.operationRetries >= this.config.maxOperationRetries) {
      return false;
    }
    return true;
  }

  public recordAttempt(taskId = "global", operationKey = "default"): void {
    this.globalRetryCount += 1;
    this.taskRetryCounts.set(taskId, (this.taskRetryCounts.get(taskId) || 0) + 1);
    this.operationRetryCounts.set(operationKey, (this.operationRetryCounts.get(operationKey) || 0) + 1);
  }

  public getRemainingOperationRetries(operationKey = "default"): number {
    const current = this.operationRetryCounts.get(operationKey) || 0;
    return Math.max(0, this.config.maxOperationRetries - current);
  }

  public calculateBackoffDelay(attemptNumber: number): number {
    const exponential = this.config.backoffBaseMs * Math.pow(2, attemptNumber);
    return Math.min(exponential, this.config.backoffMaxMs);
  }

  public resetOperation(operationKey: string): void {
    this.operationRetryCounts.delete(operationKey);
  }
}
