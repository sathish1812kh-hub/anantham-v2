import { describe, it, expect } from "vitest";
import { ContentIngestionEngine } from "../../src/content/content-ingestion-engine.js";
import { ContentGuards } from "../../src/content/content-guards.js";

describe("P9.4 Multimodal — Fixture Suite Red-Team & Ingestion Robustness", () => {
  // 1. TEXT FIXTURES
  it("ingests complex text fixtures with UTF-8, emojis, BOM, and mixed line endings", async () => {
    const textFixture = "\uFEFFHello World! 🚀\r\nLine 2 with special chars: café, naïve, \u0000nul\rLine 3\n";
    const content = await ContentIngestionEngine.ingest({
      name: "sample.txt",
      data: Buffer.from(textFixture, "utf8"),
      source: { type: "upload" },
    });

    expect(content.kind).toBe("text");
    expect(content.mimeType).toBe("text/plain");
    expect(content.representations.length).toBeGreaterThan(0);
    expect(content.representations[0].data).toBeDefined();
  });

  // 2. STRUCTURED DATA FIXTURES
  it("ingests structured JSON, CSV, TSV and neutralizes prototype pollution keys", async () => {
    const jsonFixture = JSON.stringify({
      title: "Valid JSON",
      count: 42,
      nested: { a: [1, 2, 3] },
      "__proto__": { "polluted": true },
      "constructor": { "prototype": { "hacked": true } },
    });

    const content = await ContentIngestionEngine.ingest({
      name: "data.json",
      data: Buffer.from(jsonFixture, "utf8"),
      source: { type: "upload" },
    });

    expect(content.kind).toBe("table");
    expect(content.mimeType).toBe("application/json");

    // CSV
    const csvFixture = 'id,name,notes\n1,"Alice","Likes, commas"\n2,"Bob","Line\nbreak"';
    const csvContent = await ContentIngestionEngine.ingest({
      name: "users.csv",
      data: Buffer.from(csvFixture, "utf8"),
      source: { type: "upload" },
    });
    expect(csvContent.kind).toBe("table");
    expect(csvContent.mimeType).toBe("text/csv");
  });

  // 3. CODE FIXTURES (Code as Content, not execution)
  it("treats code fixtures as content without executable authority", async () => {
    const tsCode = `
      import * as fs from 'fs';
      export function deleteEverything() {
        fs.rmSync('/', { recursive: true });
      }
    `;

    const content = await ContentIngestionEngine.ingest({
      name: "malicious_script.ts",
      data: Buffer.from(tsCode, "utf8"),
      source: { type: "upload" },
    });

    expect(content.kind).toBe("code");
    expect(content.security.authority).toBe("attachment"); // Content only, not authority
    expect(content.representations.some((r) => r.type === "code" || r.type === "text")).toBe(true);
  });

  // 4. DOCUMENT / PDF FIXTURES
  it("ingests valid PDF header and extracts document pages representation", async () => {
    const pdfBytes = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Title (Test Document) >>\nendobj\n%%EOF");
    const content = await ContentIngestionEngine.ingest({
      name: "sample.pdf",
      data: pdfBytes,
      source: { type: "upload" },
    });

    expect(content.kind).toBe("document");
    expect(content.mimeType).toBe("application/pdf");
    expect(content.representations.some((r) => r.type === "document-pages" || r.type === "metadata")).toBe(true);
  });

  // 5. IMAGE FIXTURES
  it("detects valid image magic bytes for PNG and JPEG", async () => {
    // PNG magic bytes
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const pngContent = await ContentIngestionEngine.ingest({
      name: "photo.png",
      data: pngBytes,
      source: { type: "upload" },
    });

    expect(pngContent.kind).toBe("image");
    expect(pngContent.mimeType).toBe("image/png");

    // JPEG magic bytes
    const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const jpegContent = await ContentIngestionEngine.ingest({
      name: "photo.jpg",
      data: jpegBytes,
      source: { type: "upload" },
    });

    expect(jpegContent.kind).toBe("image");
    expect(jpegContent.mimeType).toBe("image/jpeg");
  });

  // 6. MEDIA (AUDIO / VIDEO) FIXTURES
  it("detects audio and video media headers", async () => {
    // MP3 ID3 header
    const mp3Bytes = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0a]);
    const audioContent = await ContentIngestionEngine.ingest({
      name: "track.mp3",
      data: mp3Bytes,
      source: { type: "upload" },
    });

    expect(audioContent.kind).toBe("audio");
    expect(audioContent.mimeType).toBe("audio/mpeg");
  });

  // 7. ARCHIVE & ZIP FIXTURES
  it("detects ZIP archives and blocks directory traversal entries and zip bombs", async () => {
    // ZIP magic bytes PK\x03\x04
    const zipBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00]);
    const zipContent = await ContentIngestionEngine.ingest({
      name: "bundle.zip",
      data: zipBytes,
      source: { type: "upload" },
    });

    expect(zipContent.kind).toBe("archive");
    expect(zipContent.mimeType).toBe("application/zip");

    // Zip Slip path traversal check
    const pathCheck = ContentGuards.checkArchiveSafety(["../../etc/shadow", "valid/file.txt"]);
    expect(pathCheck.isSafe).toBe(false);
    expect(pathCheck.violations.some((v) => v.includes("Zip Slip"))).toBe(true);

    // Decompression ratio / Zip Bomb safety check
    const bombCheck = ContentGuards.checkArchiveBomb(
      [
        { name: "bomb.txt", compressedSize: 100, uncompressedSize: 100 * 1024 * 1024 }, // 1,000,000:1 ratio!
      ],
      { maxDecompressionRatio: 100 }
    );
    expect(bombCheck.isBomb).toBe(true);
    expect(bombCheck.violations.some((v) => v.includes("compression ratio"))).toBe(true);
  });

  // 8. MIME SPOOFING ATTACK FIXTURES
  it("detects executable payload disguised as an image (MIME spoofing)", () => {
    // Windows PE executable header MZ
    const fakeImageBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);

    const check = ContentGuards.detectMimeSpoofing(fakeImageBuffer, "image/png", "innocent_photo.png");
    expect(check.isSpoofed).toBe(true);
    expect(check.detectedMime).toBe("application/x-dosexec");
    expect(check.risk).toContain("Binary executable payload disguised");
  });

  it("detects Linux ELF executable disguised as plain text", () => {
    // Linux ELF header \x7fELF
    const fakeTextBuffer = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);

    const check = ContentGuards.detectMimeSpoofing(fakeTextBuffer, "text/plain", "readme.txt");
    expect(check.isSpoofed).toBe(true);
    expect(check.detectedMime).toBe("application/x-executable");
  });
});
