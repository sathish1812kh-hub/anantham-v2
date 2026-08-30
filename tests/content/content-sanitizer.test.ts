import { describe, it, expect } from "vitest";
import { ContentSanitizer } from "../../src/content/content-sanitizer.js";
import { ContentIngestionEngine } from "../../src/content/content-ingestion-engine.js";

describe("ContentSanitizer - Credential Scanning & Secret Redaction", () => {
  it("scans and detects various API keys, private keys, and tokens", () => {
    const rawText = `
      OpenAI: sk-proj-1234567890abcdef1234567890abcdef
      GitHub: ghp_123456789012345678901234567890123456
      AWS: AKIAIOSFODNN7EXAMPLE
      Bearer: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M
      Database: postgres://app_user:SuperSecretPassword123@db.internal:5432/main_db
    `;

    const scanResult = ContentSanitizer.scanSecrets(rawText);
    expect(scanResult.hasSecrets).toBe(true);
    expect(scanResult.findings.length).toBeGreaterThanOrEqual(4);
    expect(scanResult.findings.some(f => f.type === "openai-api-key")).toBe(true);
    expect(scanResult.findings.some(f => f.type === "github-pat")).toBe(true);
    expect(scanResult.findings.some(f => f.type === "aws-access-key")).toBe(true);
    expect(scanResult.findings.some(f => f.type === "bearer-token")).toBe(true);
  });

  it("redacts detected credentials cleanly from text", () => {
    const rawText = "Connecting with key sk-abcdef12345678901234567890 and token ghp_111122223333444455556666777788889999";
    const { redactedText, findings } = ContentSanitizer.redactSecrets(rawText);

    expect(findings).toHaveLength(2);
    expect(redactedText).not.toContain("sk-abcdef12345678901234567890");
    expect(redactedText).not.toContain("ghp_111122223333444455556666777788889999");
    expect(redactedText).toContain("[REDACTED_OPENAI_API_KEY]");
    expect(redactedText).toContain("[REDACTED_GITHUB_PAT]");
  });

  it("sanitizes ContentObject representations and elevates sensitivity if secrets found", async () => {
    const rawData = "Config file with token ghp_999988887777666655554444333322221111";
    const content = await ContentIngestionEngine.ingest({
      data: rawData,
      name: "config.txt",
      source: { type: "upload", uri: "file:///tmp/config.txt" },
      sensitivity: "normal",
    });

    const { sanitized, secretsFound } = ContentSanitizer.sanitizeContentObject(content);

    expect(secretsFound).toBe(true);
    expect(sanitized.security.sensitivity).toBe("sensitive");
    expect(sanitized.security.scanned).toBe(true);

    const textRep = sanitized.representations.find(r => r.type === "text");
    expect(textRep).toBeDefined();
    expect(typeof textRep?.data === "string" ? textRep.data : "").toContain("[REDACTED_GITHUB_PAT]");
  });
});
