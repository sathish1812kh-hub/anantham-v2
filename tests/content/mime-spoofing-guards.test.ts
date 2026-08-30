import { describe, it, expect } from "vitest";
import { ContentGuards } from "../../src/content/content-guards.js";

describe("ContentGuards - MIME Spoofing & Executable Disguise Detection", () => {
  it("detects Windows PE executable (MZ) disguised with .png filename and image MIME", () => {
    const maliciousBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]); // MZ header
    const check = ContentGuards.detectMimeSpoofing(maliciousBuffer, "image/png", "innocent_photo.png");

    expect(check.isSpoofed).toBe(true);
    expect(check.detectedMime).toBe("application/x-dosexec");
    expect(check.risk).toContain("CRITICAL: Binary executable payload disguised");
  });

  it("detects Unix ELF binary disguised with .txt extension", () => {
    const elfBuffer = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]); // \x7fELF
    const check = ContentGuards.detectMimeSpoofing(elfBuffer, "text/plain", "readme.txt");

    expect(check.isSpoofed).toBe(true);
    expect(check.detectedMime).toBe("application/x-executable");
    expect(check.risk).toContain("CRITICAL: Binary executable payload disguised");
  });

  it("detects Mach-O binary disguised as PDF", () => {
    const machBuffer = Buffer.alloc(8);
    machBuffer.writeUInt32BE(0xfeedface, 0); // Mach-O 32-bit magic
    const check = ContentGuards.detectMimeSpoofing(machBuffer, "application/pdf", "document.pdf");

    expect(check.isSpoofed).toBe(true);
    expect(check.detectedMime).toBe("application/x-mach-binary");
    expect(check.risk).toContain("CRITICAL: Binary executable payload disguised");
  });

  it("permits legitimate PNG image matching declared MIME and magic bytes", () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG header
    const check = ContentGuards.detectMimeSpoofing(pngBuffer, "image/png", "diagram.png");

    expect(check.isSpoofed).toBe(false);
    expect(check.detectedMime).toBe("image/png");
    expect(check.risk).toBeNull();
  });
});
