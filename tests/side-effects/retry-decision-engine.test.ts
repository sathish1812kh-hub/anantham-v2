import { describe, it, expect } from "vitest";
import { RetryDecisionEngine } from "../../src/side-effects/retry-decision-engine.js";

describe("P4.5 Retry Decision Engine — Deterministic Evaluation", () => {
  const engine = new RetryDecisionEngine();

  it("permits retry for transient errors on read_only and idempotent tools", () => {
    const decision = engine.evaluate({
      toolName: "read_file",
      error: { code: "RATE_LIMITED", message: "Too many requests", retryable: true },
      outcomeCertainty: "known_failed",
      operationKey: "op_read_01",
      attemptNumber: 0,
    });

    expect(decision.allowRetry).toBe(true);
    expect(decision.decisionCode).toBe("allow_retry");
    expect(decision.recommendedDelayMs).toBeGreaterThan(0);
  });

  it("rejects retry for non-retryable / fatal errors", () => {
    const decision = engine.evaluate({
      toolName: "write_file",
      error: { code: "SYNTAX_ERROR", message: "Invalid syntax", retryable: false },
      outcomeCertainty: "known_failed",
      operationKey: "op_write_01",
      attemptNumber: 0,
    });

    expect(decision.allowRetry).toBe(false);
    expect(decision.decisionCode).toBe("reject_non_retryable_error");
  });

  it("rejects retry for non-idempotent operations", () => {
    const decision = engine.evaluate({
      toolName: "git_commit",
      error: { code: "NETWORK_ERROR", message: "Connection lost", retryable: true },
      outcomeCertainty: "known_failed",
      operationKey: "op_commit_01",
      attemptNumber: 0,
    });

    expect(decision.allowRetry).toBe(false);
    expect(decision.decisionCode).toBe("reject_non_idempotent");
  });

  it("rejects retry when approval expires between attempts", () => {
    const decision = engine.evaluate({
      toolName: "write_file",
      error: { code: "RATE_LIMITED", message: "Rate limit", retryable: true },
      outcomeCertainty: "known_failed",
      operationKey: "op_write_02",
      attemptNumber: 1,
      approvalExpired: true,
    });

    expect(decision.allowRetry).toBe(false);
    expect(decision.decisionCode).toBe("reject_policy_expired");
  });
});
