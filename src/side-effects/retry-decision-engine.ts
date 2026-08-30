import {
  type SideEffectCategory,
  type OutcomeCertainty,
  type RetryDecision,
  type ToolExecutionError,
} from "../domain/index.js";
import { SideEffectClassifier } from "./side-effect-classifier.js";
import { RetryBudgetManager } from "./retry-budget-manager.js";

export interface RetryEvaluationContext {
  toolName: string;
  category?: SideEffectCategory;
  error: ToolExecutionError;
  outcomeCertainty: OutcomeCertainty;
  taskId?: string;
  operationKey: string;
  attemptNumber: number;
  approvalExpired?: boolean;
}

export class RetryDecisionEngine {
  private readonly classifier: SideEffectClassifier;
  private readonly budgetManager: RetryBudgetManager;

  constructor(options: {
    classifier?: SideEffectClassifier;
    budgetManager?: RetryBudgetManager;
  } = {}) {
    this.classifier = options.classifier || new SideEffectClassifier();
    this.budgetManager = options.budgetManager || new RetryBudgetManager();
  }

  public evaluate(context: RetryEvaluationContext): RetryDecision {
    const category = context.category || this.classifier.classify(context.toolName);
    const maxAttempts = 3;
    const budgetRemaining = this.budgetManager.getRemainingOperationRetries(context.operationKey);

    // 1. Approval Validity Check
    if (context.approvalExpired) {
      return {
        decisionCode: "reject_policy_expired",
        allowRetry: false,
        reason: "Approval expired between retry attempts. Re-authorization required.",
        attemptNumber: context.attemptNumber,
        maxAttempts,
        budgetRemaining,
      };
    }

    // 2. Non-Retryable Error Check
    if (!context.error.retryable) {
      return {
        decisionCode: "reject_non_retryable_error",
        allowRetry: false,
        reason: `Operation failed with non-retryable error: ${context.error.message}`,
        attemptNumber: context.attemptNumber,
        maxAttempts,
        budgetRemaining,
      };
    }

    // 3. Unknown Outcome Handling (CRITICAL: UNKNOWN != RETRYABLE)
    if (context.outcomeCertainty === "unknown") {
      return {
        decisionCode: "reject_unknown_outcome",
        allowRetry: false,
        reason: "Execution outcome is unknown (timeout or connection lost). Automatic duplicate retry is strictly prohibited.",
        attemptNumber: context.attemptNumber,
        maxAttempts,
        budgetRemaining,
        reconciliationAction: "Verify external state or resource existence before retrying.",
      };
    }

    // 4. Non-Idempotent / Unsafe Side-Effect Check
    if (!this.classifier.isSafeToRetry(category)) {
      return {
        decisionCode: "reject_non_idempotent",
        allowRetry: false,
        reason: `Side effect category "${category}" is non-idempotent or unknown. Blindly repeating side effects is prohibited.`,
        attemptNumber: context.attemptNumber,
        maxAttempts,
        budgetRemaining,
      };
    }

    // 5. Retry Budget Exhaustion Check
    if (!this.budgetManager.canRetry(context.taskId, context.operationKey)) {
      return {
        decisionCode: "reject_budget_exhausted",
        allowRetry: false,
        reason: "Retry budget exhausted at global, task, or operation level.",
        attemptNumber: context.attemptNumber,
        maxAttempts,
        budgetRemaining: 0,
      };
    }

    // 6. Safe to Retry
    const delay = this.budgetManager.calculateBackoffDelay(context.attemptNumber);
    this.budgetManager.recordAttempt(context.taskId, context.operationKey);

    return {
      decisionCode: "allow_retry",
      allowRetry: true,
      reason: `Safe idempotent retry permitted for ${context.toolName} (Attempt ${context.attemptNumber + 1}).`,
      attemptNumber: context.attemptNumber + 1,
      maxAttempts,
      budgetRemaining: this.budgetManager.getRemainingOperationRetries(context.operationKey),
      recommendedDelayMs: delay,
    };
  }
}
