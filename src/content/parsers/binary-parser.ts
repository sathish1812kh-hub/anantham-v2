import { createHash } from "node:crypto";
import type { ContentRepresentation } from "../../domain/content.js";

export interface BinaryParseResult {
  representations: ContentRepresentation[];
  metadata: {
    byteLength: number;
    sha256: string;
    isPreserved: boolean;
  };
}

export class BinaryParser {
  /**
   * Fallback parser preserving unknown binary files as raw byte representations.
   * PRD Part 1 Section 10 & PRD Part 3 Section 139.
   */
  public static parse(buffer: Buffer, mimeType = "application/octet-stream"): BinaryParseResult {
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const representations: ContentRepresentation[] = [];

    // Raw Binary Representation
    representations.push({
      id: `rep_bin_${sha256.slice(0, 12)}`,
      type: "raw",
      mimeType,
      sizeBytes: buffer.length,
      sha256,
      metadata: {
        preserved: true,
        byteLength: buffer.length,
      },
    });

    // Metadata representation
    const metaData = JSON.stringify({
      format: "binary",
      sizeBytes: buffer.length,
      sha256,
      mimeType,
    });

    representations.push({
      id: `rep_meta_${sha256.slice(0, 12)}`,
      type: "metadata",
      mimeType: "application/json",
      sizeBytes: Buffer.byteLength(metaData, "utf8"),
      sha256: createHash("sha256").update(metaData).digest("hex"),
      data: metaData,
      metadata: { format: "binary" },
    });

    return {
      representations,
      metadata: {
        byteLength: buffer.length,
        sha256,
        isPreserved: true,
      },
    };
  }
}
