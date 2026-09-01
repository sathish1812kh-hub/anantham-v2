import { describe, it, expect } from "vitest";
import { SecurityEventClassifier } from "../../src/observability/security-event-classifier.js";

describe("P8.5 Observability — Security Event Classification", () => {
  it("classifies prompt injection attempts", () => {
    const classification = SecurityEventClassifier.classify(
      { type: "model.failed" },
      "DENY",
      "Rejected prompt injection attack pattern"
    );
    expect(classification).toBe("PROMPT_INJECTION");
  });

  it("classifies secret detection and credential leakage", () => {
    const classification = SecurityEventClassifier.classify(
      { type: "content.sanitized" },
      "MONITOR",
      "Secret detected in payload, redacted raw API key"
    );
    expect(classification).toBe("SECRET_DETECTION");
  });

  it("classifies project tenant isolation violations", () => {
    const classification = SecurityEventClassifier.classify(
      { type: "session.denied" },
      "DENY",
      "Forbidden: Access to project 'proj_foreign' denied by tenant boundary"
    );
    expect(classification).toBe("PROJECT_ISOLATION_VIOLATION");
  });

  it("classifies webhook signature and replay failures", () => {
    const sigClass = SecurityEventClassifier.classify(
      { type: "webhook.rejected" },
      "DENY",
      "Invalid cryptographic webhook signature"
    );
    expect(sigClass).toBe("SIGNATURE_FAILURE");

    const replayClass = SecurityEventClassifier.classify(
      { type: "webhook.rejected" },
      "DENY",
      "Duplicate webhook rejected: deliveryId already processed"
    );
    expect(replayClass).toBe("REPLAY_ATTEMPT");
  });
});
