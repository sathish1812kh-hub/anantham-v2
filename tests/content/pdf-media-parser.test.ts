import { describe, it, expect } from "vitest";
import { PdfParser } from "../../src/content/parsers/pdf-parser.js";
import { ImageParser } from "../../src/content/parsers/image-parser.js";
import { MediaParser } from "../../src/content/parsers/media-parser.js";

describe("P2.1 Content Subsystem — PDF, Image & Media Parsers", () => {
  it("inspects PDF binary header, version, and page counts", () => {
    const rawPdf = "%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page >>\nendobj\n%%EOF";
    const buffer = Buffer.from(rawPdf, "binary");

    const result = PdfParser.parse(buffer);

    expect(result.metadata.pdfVersion).toBe("1.7");
    expect(result.metadata.estimatedPageCount).toBe(1);
    expect(result.representations.some((r) => r.type === "document-pages")).toBe(true);
  });

  it("extracts PNG image dimensions from IHDR chunk", () => {
    // Construct synthetic PNG header: 8 bytes magic + 4 bytes len + 4 bytes 'IHDR' + 4 bytes width (800) + 4 bytes height (600)
    const pngHeader = Buffer.alloc(24);
    pngHeader[0] = 0x89;
    pngHeader[1] = 0x50;
    pngHeader[2] = 0x4e;
    pngHeader[3] = 0x47;
    pngHeader[4] = 0x0d;
    pngHeader[5] = 0x0a;
    pngHeader[6] = 0x1a;
    pngHeader[7] = 0x0a;
    pngHeader.write("IHDR", 12);
    pngHeader.writeUInt32BE(800, 16);
    pngHeader.writeUInt32BE(600, 20);

    const result = ImageParser.parse(pngHeader, "image/png");

    expect(result.metadata.format).toBe("png");
    expect(result.metadata.width).toBe(800);
    expect(result.metadata.height).toBe(600);
    expect(result.representations.some((r) => r.type === "image")).toBe(true);
  });

  it("extracts audio metadata and WAV header parameters", () => {
    const wavBuffer = Buffer.alloc(44);
    wavBuffer.write("RIFF", 0);
    wavBuffer.write("WAVE", 8);
    wavBuffer.write("fmt ", 12);
    wavBuffer.writeUInt16LE(2, 22); // 2 channels (stereo)
    wavBuffer.writeUInt32LE(44100, 24); // 44.1 kHz sample rate

    const result = MediaParser.parse(wavBuffer, "audio/wav");

    expect(result.metadata.mediaType).toBe("audio");
    expect(result.metadata.container).toBe("wav");
    expect(result.metadata.channels).toBe(2);
    expect(result.metadata.sampleRateHz).toBe(44100);
  });
});
