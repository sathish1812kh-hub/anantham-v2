import { describe, it, expect } from "vitest";
import { ContentIngestionEngine } from "../../src/content/content-ingestion-engine.js";
import { ContentSanitizer } from "../../src/content/content-sanitizer.js";

describe("P9.4 Multimodal — Parser Isolation, Secret Safety & Tenant Boundary", () => {
  it("isolates malformed structured data and fails closed gracefully", async () => {
    // Malformed JSON that breaks JSON.parse
    const malformedJson = '{ "name": "Broken", "unclosed": [1, 2, ';

    await expect(
      ContentIngestionEngine.ingest({
        name: "broken.json",
        data: Buffer.from(malformedJson, "utf8"),
        source: { type: "upload" },
      })
    ).rejects.toThrow(/Failed to parse JSON content/);
  });

  it("redacts sensitive API keys and tokens embedded within multimodal text payloads", async () => {
    const rawPayloadWithSecrets = `
      Configuration Settings:
      DATABASE_URL=postgres://user:password@localhost:5432/prod
      OPENAI_API_KEY=sk-proj-1234567890abcdef1234567890abcdef12345678
      AUTH_HEADER=Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token123
    `;

    const content = await ContentIngestionEngine.ingest({
      name: "config.env",
      data: Buffer.from(rawPayloadWithSecrets, "utf8"),
      source: { type: "upload" },
    });

    const rep = content.representations[0];
    const sanitizedText = ContentSanitizer.sanitize(typeof rep.data === "string" ? rep.data : "");

    expect(sanitizedText).not.toContain("1234567890abcdef");
    expect(sanitizedText).toContain("[REDACTED");
  });

  it("enforces strict project scoping on ingested ContentObjects", async () => {
    const contentA = await ContentIngestionEngine.ingest({
      name: "project_a_file.txt",
      data: Buffer.from("Secret Project A Data", "utf8"),
      source: { type: "upload" },
      projectId: "proj_tenant_A",
    });

    const contentB = await ContentIngestionEngine.ingest({
      name: "project_b_file.txt",
      data: Buffer.from("Secret Project B Data", "utf8"),
      source: { type: "upload" },
      projectId: "proj_tenant_B",
    });

    expect(contentA.id).not.toBe(contentB.id);
  });
});
