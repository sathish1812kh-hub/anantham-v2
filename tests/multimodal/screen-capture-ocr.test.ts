import { describe, it, expect } from "vitest";
import { OcrPipeline } from "../../src/multimodal/ocr-pipeline.js";

describe("PRD-PART2-302: Screen Capture & OCR Pipeline", () => {
  it("processes image buffers and produces recognized text blocks with bounding boxes and confidence scores", async () => {
    const pipeline = new OcrPipeline();
    const fakeImageBuffer = Buffer.from("LOGIN PASSWORD SUBMIT CANCEL HELP SETTINGS");

    const result = await pipeline.processImage(fakeImageBuffer);
    expect(result.blocks.length).toBeGreaterThan(0);
    expect(result.confidenceAvg).toBeGreaterThan(0.9);
    expect(result.fullText).toContain("LOGIN");

    const firstBlock = result.blocks[0];
    expect(firstBlock.box).toBeDefined();
    expect(firstBlock.box.width).toBeGreaterThan(0);
    expect(firstBlock.box.height).toBeGreaterThan(0);
  });
});
