export type FailureClassification =
  | "POLICY_DENIAL"
  | "PERMISSION_DENIED"
  | "INVALID_SCHEMA"
  | "PERMANENT_CAPABILITY_FAILURE"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "TRANSIENT_TOOL_ERROR"
  | "UNKNOWN";

export interface WorkflowRetryDecision {
  shouldRetry: boolean;
  classification: FailureClassification;
  backoffMs: number;
  reason: string;
}

/**
 * Classified Failure & Bounded Retry Decision Handler for Workflows.
 * PRD Part 2 Section 110 & Playbook Section 14.
 */
export class WorkflowRetryHandler {
  /**
   * Classifies an error into retryable vs non-retryable categories.
   */
  public classifyError(error: unknown): FailureClassification {
    if (!error) return "UNKNOWN";
    const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();

    // 1. Non-Retryable Policy / Security / Schema Denials
    if (msg.includes("policy denial") || msg.includes("policy denied") || msg.includes("blocked by policy")) {
      return "POLICY_DENIAL";
    }
    if (msg.includes("permission denied") || msg.includes("unauthorized") || msg.includes("forbidden")) {
      return "PERMISSION_DENIED";
    }
    if (msg.includes("invalid schema") || msg.includes("validation error") || msg.includes("zoderror")) {
      return "INVALID_SCHEMA";
    }
    if (msg.includes("unsupported capability") || msg.includes("capability mismatch")) {
      return "PERMANENT_CAPABILITY_FAILURE";
    }

    // 2. Retryable Errors
    if (msg.includes("rate limit") || msg.includes("429") || msg.includes("too many requests")) {
      return "RATE_LIMIT";
    }
    if (msg.includes("timed out") || msg.includes("timeout") || msg.includes("etimedout")) {
      return "TIMEOUT";
    }
    if (msg.includes("econnreset") || msg.includes("enotfound") || msg.includes("network error") || msg.includes("fetch failed")) {
      return "NETWORK_ERROR";
    }
    if (msg.includes("transient") || msg.includes("busy") || msg.includes("locked")) {
      return "TRANSIENT_TOOL_ERROR";
    }

    return "UNKNOWN";
  }

  /**
   * Evaluates whether a failed node/task attempt should be retried.
   */
  public evaluateRetry(
    error: unknown,
    currentAttempt: number,
    maxRetries = 3
  ): WorkflowRetryDecision {
    const classification = this.classifyError(error);

    // Non-retryable classes fail closed immediately
    if (
      classification === "POLICY_DENIAL" ||
      classification === "PERMISSION_DENIED" ||
      classification === "INVALID_SCHEMA" ||
      classification === "PERMANENT_CAPABILITY_FAILURE"
    ) {
      return {
        shouldRetry: false,
        classification,
        backoffMs: 0,
        reason: `Failure classification "${classification}" is non-retryable. Failing closed immediately.`,
      };
    }

    // Bounded retries check
    if (currentAttempt >= maxRetries) {
      return {
        shouldRetry: false,
        classification,
        backoffMs: 0,
        reason: `Maximum retry attempts reached (${currentAttempt}/${maxRetries}).`,
      };
    }

    // Compute exponential backoff with base 100ms
    const baseMs = 100;
    const backoffMs = Math.min(baseMs * Math.pow(2, currentAttempt), 5000);

    return {
      shouldRetry: true,
      classification,
      backoffMs,
      reason: `Transient failure "${classification}". Retrying attempt ${currentAttempt + 1}/${maxRetries} after ${backoffMs}ms backoff.`,
    };
  }
}
