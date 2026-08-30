import { describe, it, expect } from "vitest";
import { RetryDecisionEngine } from "../../src/side-effects/retry-decision-engine.js";

describe("P4.5 Unknown Outcome Safety — UNKNOWN != RETRYABLE Invariant", () => {
  const engine = new RetryDecisionEngine();

  it("CRITICAL INVARIANT: Rejects automatic retry when outcome certainty is unknown", () => {
    const decision = engine.evaluate({
      toolName: "fetch_url",
      error: { code: "TIMEOUT", message: "Request timed out after dispatch", retryable: true },
      outcomeCertainty: "unknown",
      operationKey: "op_unknown_01",
      attemptNumber: 0,
    });

    expect(decision.allowRetry).toBe(false);
    expect(decision.decisionCode).toBe("reject_unknown_outcome");
    expect(decision.reason).toContain("Execution outcome is unknown");
    expect(decision.reconciliationAction).toBeDefined();
  });

  it("CRITICAL INVARIANT: Process timeout on file write does not blindly duplicate effect", () => {
    const decision = engine.evaluate({
      toolName: "write_file",
      error: { code: "PROCESS_TIMEOUT", message: "Process timed out after 30s", retryable: true },
      outcomeCertainty: "unknown",
      operationKey: "op_write_timeout",
      attemptNumber: 0,
    });

    expect(decision.allowRetry).toBe(false);
    expect(decision.decisionCode).toBe("reject_unknown_outcome");
  });
});
