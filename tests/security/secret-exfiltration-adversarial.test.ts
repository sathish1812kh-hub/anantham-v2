import { describe, it, expect } from "vitest";
import { ContentSanitizer } from "../../src/content/content-sanitizer.js";
import { InMemorySecretStore, maskSecret } from "../../src/models/secret-store.js";

describe("P9.3 Security — Secret Leakage, Redaction & Tenant Isolation", () => {
  it("automatically detects and redacts high-entropy API keys and tokens in payload outputs", () => {
    const rawOutputs = [
      { text: "My OpenAI key is sk-proj-1234567890abcdef1234567890abcdef12345678", pattern: "sk-proj-" },
      { text: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc", pattern: "Bearer" },
      { text: "AWS Key: AKIAIOSFODNN7EXAMPLE", pattern: "AKIA" },
      { text: "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----", pattern: "BEGIN RSA PRIVATE KEY" },
    ];

    for (const item of rawOutputs) {
      const sanitized = ContentSanitizer.sanitize(item.text);
      expect(sanitized).not.toContain("1234567890abcdef");
      expect(sanitized).not.toContain("MIIEowIBAAKCAQEA");
      expect(sanitized).toContain("[REDACTED");
    }
  });

  it("enforces strict secret masking and fingerprint preservation", () => {
    const store = new InMemorySecretStore();
    const rawKey = "sk-proj-super-secret-1234567890";
    const masked = maskSecret(rawKey);

    expect(masked).toBe("sk-...7890");
    expect(masked).not.toContain("super-secret");
  });
});
