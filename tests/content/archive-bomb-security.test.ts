import { describe, it, expect } from "vitest";
import { ContentGuards } from "../../src/content/content-guards.js";

describe("ContentGuards - Archive Bomb & Decompression Protection", () => {
  it("detects archive entry with anomalous decompression ratio (> 100:1)", () => {
    const maliciousEntries = [
      { name: "normal.txt", compressedSize: 500, uncompressedSize: 800 },
      { name: "bomb.bin", compressedSize: 10 * 1024, uncompressedSize: 50 * 1024 * 1024 }, // 5000:1 ratio, 50MB
    ];

    const result = ContentGuards.checkArchiveBomb(maliciousEntries);
    expect(result.isBomb).toBe(true);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0]).toContain("anomalous compression ratio");
  });

  it("detects archive exceeding total entry count limit", () => {
    const excessiveEntries = Array.from({ length: 1500 }, (_, i) => ({
      name: `file_${i}.txt`,
      compressedSize: 10,
      uncompressedSize: 20,
    }));

    const result = ContentGuards.checkArchiveBomb(excessiveEntries, { maxEntryCount: 1000 });
    expect(result.isBomb).toBe(true);
    expect(result.violations[0]).toContain("Archive entry count (1500) exceeds safety limit of 1000");
  });

  it("detects total uncompressed size exceeding safety threshold", () => {
    const entries = [
      { name: "large1.dat", compressedSize: 10 * 1024 * 1024, uncompressedSize: 60 * 1024 * 1024 },
      { name: "large2.dat", compressedSize: 10 * 1024 * 1024, uncompressedSize: 60 * 1024 * 1024 },
    ];

    const result = ContentGuards.checkArchiveBomb(entries, { maxTotalExpandedBytes: 100 * 1024 * 1024 });
    expect(result.isBomb).toBe(true);
    expect(result.violations.some(v => v.includes("Total uncompressed archive size"))).toBe(true);
  });

  it("passes safe, bounded archive entries without violations", () => {
    const safeEntries = [
      { name: "src/index.ts", compressedSize: 1024, uncompressedSize: 3000 },
      { name: "docs/readme.md", compressedSize: 500, uncompressedSize: 1200 },
    ];

    const result = ContentGuards.checkArchiveBomb(safeEntries);
    expect(result.isBomb).toBe(false);
    expect(result.violations).toHaveLength(0);
  });
});
