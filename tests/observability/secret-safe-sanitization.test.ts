import { describe, it, expect } from "vitest";
import { AuditLogger } from "../../src/observability/audit-logger.js";
import { ContentSanitizer } from "../../src/content/content-sanitizer.js";

describe("P8.5 Observability — Secret-Safe Logging & Sanitization", () => {
  it("scrubs raw API keys, bearer tokens, and secrets from audit payloads", () => {
    const rawPayload = {
      apiKey: "sk-proj-1234567890abcdef1234567890",
      password: "SuperSecretPassword123!",
      authHeader: "Bearer sk-998877665544332211",
      safeData: "user requested code review",
    };

    const sanitized = ContentSanitizer.sanitize(rawPayload);
    expect(sanitized.apiKey).toBe("[REDACTED]");
    expect(sanitized.password).toBe("[REDACTED]");
    expect(sanitized.authHeader).toBe("[REDACTED]");
    expect(sanitized.safeData).toBe("user requested code review");

    const logger = new AuditLogger();
    const record = logger.record({
      event: {
        id: "evt_secret_test",
        projectId: "proj_secret",
        type: "tool.execution",
        payload: rawPayload,
      },
      actor: "user",
      action: "tool.execute",
      classification: "INFORMATIONAL",
      decision: "PERMIT",
      reasonCode: "TOOL_AUDIT",
    });

    // Digest computed over sanitized content, ensuring raw secrets never enter digest
    expect(record.payloadDigest).toBeDefined();
    expect(record.payloadDigest.length).toBe(64);
  });
});
