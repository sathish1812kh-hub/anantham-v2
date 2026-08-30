import { createHash } from "node:crypto";
import type { ContentRepresentation } from "../../domain/content.js";

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ImageParseResult {
  representations: ContentRepresentation[];
  metadata: {
    format: string;
    width?: number;
    height?: number;
    colorDepth?: number;
    isAnimated?: boolean;
  };
}

export class ImageParser {
  /**
   * Parses image headers and extracts dimensional metadata and representations.
   * PRD Part 1 Section 11 & Section 12.
   */
  public static parse(buffer: Buffer, mimeType: string): ImageParseResult {
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    let width: number | undefined;
    let height: number | undefined;
    let format = "unknown";
    let isAnimated = false;

    // 1. PNG Dimensions (IHDR Chunk at byte 16..24)
    if (buffer.length >= 24 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      format = "png";
      width = buffer.readUInt32BE(16);
      height = buffer.readUInt32BE(20);
    }
    // 2. JPEG Dimensions (scan for SOF0/SOF2 marker: 0xFF 0xC0 or 0xFF 0xC2)
    else if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
      format = "jpeg";
      let offset = 2;
      while (offset < buffer.length - 8) {
        if (buffer[offset] === 0xff && (buffer[offset + 1] === 0xc0 || buffer[offset + 1] === 0xc2)) {
          height = buffer.readUInt16BE(offset + 5);
          width = buffer.readUInt16BE(offset + 7);
          break;
        }
        offset++;
      }
    }
    // 3. GIF Dimensions (bytes 6..10)
    else if (buffer.length >= 10 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
      format = "gif";
      width = buffer.readUInt16LE(6);
      height = buffer.readUInt16LE(8);
      isAnimated = true;
    }
    // 4. SVG Dimensions
    else if (mimeType.includes("svg") || buffer.toString("utf8", 0, 100).includes("<svg")) {
      format = "svg";
      const svgText = buffer.toString("utf8");
      const wMatch = svgText.match(/width=["']([0-9]+)/);
      const hMatch = svgText.match(/height=["']([0-9]+)/);
      if (wMatch && wMatch[1]) width = parseInt(wMatch[1], 10);
      if (hMatch && hMatch[1]) height = parseInt(hMatch[1], 10);
    }

    const representations: ContentRepresentation[] = [];

    // Image payload representation (base64 data URI for small images <= 2MB)
    const isSmall = buffer.length <= 2 * 1024 * 1024;
    representations.push({
      id: `rep_img_${sha256.slice(0, 12)}`,
      type: "image",
      mimeType,
      sizeBytes: buffer.length,
      sha256,
      data: isSmall ? `data:${mimeType};base64,${buffer.toString("base64")}` : undefined,
      metadata: {
        format,
        width,
        height,
        isAnimated,
      },
    });

    // Metadata representation
    representations.push({
      id: `rep_meta_${sha256.slice(0, 12)}`,
      type: "metadata",
      mimeType: "application/json",
      sizeBytes: 0,
      sha256,
      data: JSON.stringify({ format, width, height, isAnimated, sizeBytes: buffer.length }),
      metadata: { format, width, height },
    });

    return {
      representations,
      metadata: {
        format,
        width,
        height,
        isAnimated,
      },
    };
  }
}
