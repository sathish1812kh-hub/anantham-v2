import { describe, it, expect } from "vitest";
import { ImageProcessor } from "../../src/multimodal/image-processor.js";

describe("PRD-MM-002: Vision & Image Processing Pipeline", () => {
  const processor = new ImageProcessor();

  it("detects PNG format and extracts width, height, and aspect ratio from IHDR header", () => {
    // Construct minimal PNG header: 8 bytes magic + 4 bytes chunk len + 4 bytes 'IHDR' + 4 bytes W + 4 bytes H
    const pngHeader = Buffer.alloc(24);
    pngHeader.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    pngHeader.writeUInt32BE(1920, 16); // width
    pngHeader.writeUInt32BE(1080, 20); // height

    expect(processor.detectFormat(pngHeader)).toBe("png");

    const dimensions = processor.extractDimensions(pngHeader);
    expect(dimensions.width).toBe(1920);
    expect(dimensions.height).toBe(1080);
    expect(dimensions.aspectRatio).toBe("16:9");

    const boundsCheck = processor.validateBounds(dimensions, 4096);
    expect(boundsCheck.valid).toBe(true);
  });

  it("crops and clamps bounding boxes within image bounds", () => {
    const dims = { width: 1000, height: 800, aspectRatio: "5:4" };
    const box = { x: 900, y: 700, width: 300, height: 200 };

    const cropped = processor.cropRegion(dims, box);
    expect(cropped.x).toBe(900);
    expect(cropped.y).toBe(700);
    expect(cropped.width).toBe(100); // Clamped to 1000 - 900
    expect(cropped.height).toBe(100); // Clamped to 800 - 700
  });
});
