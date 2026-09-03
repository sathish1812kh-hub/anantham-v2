/**
 * Screen Capture & OCR Pipeline
 * PRD-PART2-302: Screen Capture & OCR Pipeline
 */

import type { OcrBlock } from "./types.js";

export interface OcrExtractionResult {
  fullText: string;
  blocks: OcrBlock[];
  confidenceAvg: number;
}

export class OcrPipeline {
  private customEngine?: (imageBuffer: Buffer) => Promise<OcrBlock[]> | OcrBlock[];

  constructor(options: { engine?: (imageBuffer: Buffer) => Promise<OcrBlock[]> | OcrBlock[] } = {}) {
    this.customEngine = options.engine;
  }

  public async processImage(imageBuffer: Buffer): Promise<OcrExtractionResult> {
    if (this.customEngine) {
      const blocks = await this.customEngine(imageBuffer);
      const fullText = blocks.map((b) => b.text).join(" ");
      const confidenceAvg =
        blocks.length > 0 ? blocks.reduce((acc, b) => acc + b.confidence, 0) / blocks.length : 1.0;
      return { fullText, blocks, confidenceAvg };
    }

    // Default heuristic OCR simulator: extracts printable strings from image or binary stream
    const blocks: OcrBlock[] = [];
    const str = imageBuffer.toString("utf-8");
    const words = str.match(/[A-Za-z0-9_-]{3,}/g) ?? [];

    let currentY = 10;
    words.slice(0, 50).forEach((word, idx) => {
      blocks.push({
        id: `ocr_block_${idx}`,
        text: word,
        confidence: 0.95,
        box: {
          x: 10 + (idx % 5) * 80,
          y: currentY,
          width: word.length * 8,
          height: 16,
        },
      });
      if (idx % 5 === 4) {
        currentY += 20;
      }
    });

    const fullText = blocks.map((b) => b.text).join(" ");
    const confidenceAvg =
      blocks.length > 0 ? blocks.reduce((acc, b) => acc + b.confidence, 0) / blocks.length : 1.0;

    return { fullText, blocks, confidenceAvg };
  }
}
