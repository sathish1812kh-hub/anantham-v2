import { describe, it, expect } from "vitest";
import { TextParser } from "../../src/content/parsers/text-parser.js";
import { ContentGuards } from "../../src/content/content-guards.js";

describe("P2.1 Content Subsystem — Text & Code Parser", () => {
  it("parses plaintext and extracts character count, lines, and token estimates", () => {
    const raw = "Hello world!\nThis is Anantham V2.\nMultimodal content ingestion.";
    const buffer = Buffer.from(raw, "utf8");

    const result = TextParser.parse(buffer, "notes.txt", "text/plain");

    expect(result.representations).toHaveLength(1);
    expect(result.representations[0].type).toBe("text");
    expect(result.representations[0].data).toBe(raw);
    expect(result.metadata.lineCount).toBe(3);
    expect(result.metadata.characterCount).toBe(raw.length);
    expect(result.metadata.estimatedTokens).toBe(ContentGuards.estimateTokens(raw));
  });

  it("parses code files and creates fenced markdown representations", () => {
    const code = "export function sum(a: number, b: number): number {\n  return a + b;\n}";
    const buffer = Buffer.from(code, "utf8");

    const result = TextParser.parse(buffer, "math.ts", "text/typescript");

    expect(result.metadata.isCode).toBe(true);
    expect(result.metadata.language).toBe("typescript");
    expect(result.representations).toHaveLength(2); // text + markdown

    const mdRep = result.representations.find((r) => r.type === "markdown");
    expect(mdRep).toBeDefined();
    expect(mdRep?.data).toContain("```typescript\n" + code + "\n```");
  });

  it("parses markdown files preserving structure", () => {
    const md = "# Title\n\n- Item 1\n- Item 2";
    const buffer = Buffer.from(md, "utf8");

    const result = TextParser.parse(buffer, "README.md", "text/markdown");

    expect(result.metadata.isMarkdown).toBe(true);
    expect(result.representations.some((r) => r.type === "markdown")).toBe(true);
  });
});
