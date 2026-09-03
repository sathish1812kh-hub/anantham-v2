import { describe, it, expect } from "vitest";
import { CodeIntelFaultIsolator } from "../../src/code-intel/fault-isolator.js";
import { MultiLanguageAstParser } from "../../src/code-intel/parsers/multi-language-ast-parser.js";

describe("PRD-INV-001: Strict Code Intelligence Invariants & Fault Isolation", () => {
  const isolator = new CodeIntelFaultIsolator({ timeoutMs: 200, maxFileSizeChars: 1000 });
  const parser = new MultiLanguageAstParser();

  it("never crashes runtime when encountering malformed or corrupted syntax", async () => {
    const brokenCode = `export class { function () { {{ broken syntax +++ %%%`;
    const result = await isolator.executeIsolatedParse("broken.ts", brokenCode, (p, c) =>
      parser.parse(p, c)
    );

    expect(result).toBeDefined();
    expect(result.filePath).toBe("broken.ts");
    expect(Array.isArray(result.symbols)).toBe(true);
  });

  it("rejects binary files containing null bytes before passing to parser", async () => {
    const binaryContent = "MZ\x00\x00\x03\x00\x00\x00\x04\x00\x00\x00";
    const result = await isolator.executeIsolatedParse("malicious.exe", binaryContent, (p, c) =>
      parser.parse(p, c)
    );

    expect(result.isPartial).toBe(true);
    expect(result.error).toContain("Binary content rejected");
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it("enforces maximum file size limit threshold", async () => {
    const largeContent = "x".repeat(2000); // Exceeds 1000 threshold
    const result = await isolator.executeIsolatedParse("large.txt", largeContent, (p, c) =>
      parser.parse(p, c)
    );

    expect(result.isPartial).toBe(true);
    expect(result.error).toContain("File size exceeds threshold");
  });

  it("handles parser timeouts gracefully without unhandled promise rejections", async () => {
    const slowIsolator = new CodeIntelFaultIsolator({ timeoutMs: 50 });
    const result = await slowIsolator.executeIsolatedParse(
      "infinite.ts",
      "while(1);",
      () => new Promise((resolve) => setTimeout(resolve, 150)) as any
    );

    expect(result.isPartial).toBe(true);
    expect(result.error).toContain("Parser timeout");
  });
});
