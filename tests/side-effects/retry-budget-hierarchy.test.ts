import { describe, it, expect } from "vitest";
import { RetryBudgetManager } from "../../src/side-effects/retry-budget-manager.js";

describe("P4.5 Retry Budget Hierarchy — Multi-Layer Resource Limits", () => {
  it("enforces operation-level retry limits", () => {
    const manager = new RetryBudgetManager({ maxOperationRetries: 2 });

    expect(manager.canRetry("task_1", "op_1")).toBe(true);
    manager.recordAttempt("task_1", "op_1"); // attempt 1

    expect(manager.canRetry("task_1", "op_1")).toBe(true);
    manager.recordAttempt("task_1", "op_1"); // attempt 2

    expect(manager.canRetry("task_1", "op_1")).toBe(false);
  });

  it("enforces task-level retry budget across multiple operations", () => {
    const manager = new RetryBudgetManager({
      maxTaskRetries: 3,
      maxOperationRetries: 2,
    });

    // Op 1 takes 2 attempts
    manager.recordAttempt("task_shared", "op_1");
    manager.recordAttempt("task_shared", "op_1");

    // Op 2 takes 1 attempt
    manager.recordAttempt("task_shared", "op_2");

    // Total task attempts = 3 => exhausted
    expect(manager.canRetry("task_shared", "op_3")).toBe(false);
  });

  it("enforces global retry budget across all tasks and operations", () => {
    const manager = new RetryBudgetManager({
      maxGlobalRetries: 4,
      maxTaskRetries: 10,
      maxOperationRetries: 10,
    });

    manager.recordAttempt("t1", "op1");
    manager.recordAttempt("t2", "op2");
    manager.recordAttempt("t3", "op3");
    manager.recordAttempt("t4", "op4");

    expect(manager.canRetry("t5", "op5")).toBe(false);
  });
});
