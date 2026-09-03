import { describe, it, expect } from "vitest";
import { DocumentPdfExtractor } from "../../src/multimodal/document-pdf-extractor.js";

describe("PRD-MM-005: Document & PDF Understanding", () => {
  const extractor = new DocumentPdfExtractor();

  it("extracts headings, paragraphs, and tables across document pages", () => {
    const rawDoc = `
# Executive Summary
The platform architecture provides high durability.

| Metric | Target | Status |
|---|---|---|
| RPO | 0 | Achieved |
| RTO | < 100ms | Achieved |

<!-- page -->

# Security Compliance
Zero untrusted execution verified.
`;

    const sections = extractor.parseDocumentText(rawDoc);
    expect(sections.length).toBe(2);

    // Page 1
    expect(sections[0].pageNumber).toBe(1);
    expect(sections[0].heading).toBe("Executive Summary");
    expect(sections[0].tables).toBeDefined();
    expect(sections[0].tables![0].length).toBe(3); // Header + 2 data rows

    // Page 2
    expect(sections[1].pageNumber).toBe(2);
    expect(sections[1].heading).toBe("Security Compliance");
    expect(sections[1].text).toContain("Zero untrusted execution verified");
  });
});
