/**
 * Vision & Image Processing Pipeline
 * PRD-MM-002: Vision & Image Processing Pipeline
 */

import type { ImageDimensions, ImageFormat, BoundingBox } from "./types.js";

export class ImageProcessor {
  public detectFormat(buffer: Buffer): ImageFormat {
    if (buffer.length < 8) return "unknown";

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return "png";
    }

    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return "jpeg";
    }

    // GIF: GIF87a or GIF89a
    if (
      buffer[0] === 0x47 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x38
    ) {
      return "gif";
    }

    // WebP: RIFF .... WEBP
    if (
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP"
    ) {
      return "webp";
    }

    // SVG: check text snippet
    const textStart = buffer.toString("utf-8", 0, Math.min(buffer.length, 256)).trim().toLowerCase();
    if (textStart.includes("<svg") || textStart.includes("<?xml")) {
      return "svg";
    }

    return "unknown";
  }

  public extractDimensions(buffer: Buffer): ImageDimensions {
    const format = this.detectFormat(buffer);

    switch (format) {
      case "png": {
        // PNG header IHDR width at byte 16 (4 bytes big-endian), height at byte 20 (4 bytes big-endian)
        if (buffer.length >= 24) {
          const width = buffer.readUInt32BE(16);
          const height = buffer.readUInt32BE(20);
          return {
            width,
            height,
            aspectRatio: this.calculateAspectRatio(width, height),
          };
        }
        break;
      }

      case "gif": {
        // GIF width at byte 6 (2 bytes little-endian), height at byte 8 (2 bytes little-endian)
        if (buffer.length >= 10) {
          const width = buffer.readUInt16LE(6);
          const height = buffer.readUInt16LE(8);
          return {
            width,
            height,
            aspectRatio: this.calculateAspectRatio(width, height),
          };
        }
        break;
      }

      case "svg": {
        const text = buffer.toString("utf-8");
        const wMatch = text.match(/width=["'](\d+)["']/i);
        const hMatch = text.match(/height=["'](\d+)["']/i);
        const width = wMatch && wMatch[1] ? parseInt(wMatch[1], 10) : 800;
        const height = hMatch && hMatch[1] ? parseInt(hMatch[1], 10) : 600;
        return {
          width,
          height,
          aspectRatio: this.calculateAspectRatio(width, height),
        };
      }

      default:
        break;
    }

    // Default fallback dimensions
    return {
      width: 1024,
      height: 768,
      aspectRatio: "4:3",
    };
  }

  public validateBounds(
    dimensions: ImageDimensions,
    maxDimensionPixels = 4096
  ): { valid: boolean; reason?: string } {
    if (dimensions.width <= 0 || dimensions.height <= 0) {
      return { valid: false, reason: "Invalid image dimensions (non-positive width or height)" };
    }
    if (dimensions.width > maxDimensionPixels || dimensions.height > maxDimensionPixels) {
      return {
        valid: false,
        reason: `Image dimension (${dimensions.width}x${dimensions.height}) exceeds max allowed limit (${maxDimensionPixels}px)`,
      };
    }
    return { valid: true };
  }

  public cropRegion(dimensions: ImageDimensions, box: BoundingBox): BoundingBox {
    // Clamp bounding box strictly inside image dimensions
    const x = Math.max(0, Math.min(box.x, dimensions.width));
    const y = Math.max(0, Math.min(box.y, dimensions.height));
    const width = Math.min(box.width, dimensions.width - x);
    const height = Math.min(box.height, dimensions.height - y);

    return { x, y, width, height };
  }

  private calculateAspectRatio(width: number, height: number): string {
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    if (width === 0 || height === 0) return "1:1";
    const d = gcd(width, height);
    return `${Math.round(width / d)}:${Math.round(height / d)}`;
  }
}
