import { describe, it, expect } from "vitest";
import { ArchiveParser } from "../../src/content/parsers/archive-parser.js";
import { BinaryParser } from "../../src/content/parsers/binary-parser.js";
import { ContentGuards } from "../../src/content/content-guards.js";

describe("P2.1 Content Subsystem — Archive & Binary Preservation Parsers", () => {
  it("indexes ZIP archive entries and detects Zip Slip traversal risks", () => {
    // Construct synthetic ZIP local header for safe file
    const zipHeader = Buffer.alloc(60);
    zipHeader[0] = 0x50;
    zipHeader[1] = 0x4b;
    zipHeader[2] = 0x03;
    zipHeader[3] = 0x04;
    zipHeader.writeUInt32LE(10, 18); // compSize
    zipHeader.writeUInt32LE(10, 22); // uncompSize
    const filename = "src/index.ts";
    zipHeader.writeUInt16LE(filename.length, 26);
    zipHeader.writeUInt16LE(0, 28);
    zipHeader.write(filename, 30);

    const result = ArchiveParser.parse(zipHeader, "application/zip");

    expect(result.metadata.format).toBe("zip");
    expect(result.metadata.entryCount).toBe(1);
    expect(result.metadata.isSafe).toBe(true);
    expect(result.representations.some((r) => r.type === "archive-index")).toBe(true);
  });

  it("flags Zip Slip attacks in archives", () => {
    const check = ContentGuards.checkArchiveSafety(["valid/file.txt", "../../etc/passwd", "malicious.exe"]);
    expect(check.isSafe).toBe(false);
    expect(check.violations).toHaveLength(2);
    expect(check.violations[0]).toContain("Zip Slip path traversal risk");
    expect(check.violations[1]).toContain("Restricted executable entry");
  });

  it("preserves unknown binary content without silent dropping", () => {
    const rawBinary = Buffer.from([0x00, 0xff, 0x12, 0x34, 0xfe, 0xdc, 0xba, 0x98]);
    const result = BinaryParser.parse(rawBinary, "application/octet-stream");

    expect(result.metadata.isPreserved).toBe(true);
    expect(result.metadata.byteLength).toBe(8);
    expect(result.representations.some((r) => r.type === "raw")).toBe(true);
    expect(result.representations.some((r) => r.type === "metadata")).toBe(true);
  });
});
