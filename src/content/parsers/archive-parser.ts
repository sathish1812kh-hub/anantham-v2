import { createHash } from "node:crypto";
import type { ContentRepresentation } from "../../domain/content.js";
import { ContentGuards } from "../content-guards.js";

export interface ArchiveEntry {
  name: string;
  sizeBytes: number;
  isDirectory: boolean;
  compressedSizeBytes?: number;
}

export interface ArchiveParseResult {
  representations: ContentRepresentation[];
  metadata: {
    format: "zip" | "tar" | "gzip";
    entryCount: number;
    totalUncompressedBytes: number;
    isSafe: boolean;
    violations: string[];
  };
}

export class ArchiveParser {
  /**
   * Safely indexes archive contents and inspects entry tables without unsafe extraction.
   * PRD Part 1 Section 13 & PRD Part 3 Section 138.
   */
  public static parse(buffer: Buffer, mimeType: string): ArchiveParseResult {
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const entries: ArchiveEntry[] = [];
    let format: "zip" | "tar" | "gzip" = "zip";

    if (mimeType.includes("gzip") || (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b)) {
      format = "gzip";
    }

    // Parse ZIP Local File Headers: PK\x03\x04
    if (format === "zip") {
      let offset = 0;
      while (offset < buffer.length - 30) {
        if (
          buffer[offset] === 0x50 &&
          buffer[offset + 1] === 0x4b &&
          buffer[offset + 2] === 0x03 &&
          buffer[offset + 3] === 0x04
        ) {
          const compSize = buffer.readUInt32LE(offset + 18);
          const uncompSize = buffer.readUInt32LE(offset + 22);
          const nameLen = buffer.readUInt16LE(offset + 26);
          const extraLen = buffer.readUInt16LE(offset + 28);

          if (offset + 30 + nameLen <= buffer.length) {
            const entryName = buffer.toString("utf8", offset + 30, offset + 30 + nameLen);
            const isDirectory = entryName.endsWith("/");

            entries.push({
              name: entryName,
              sizeBytes: uncompSize,
              compressedSizeBytes: compSize,
              isDirectory,
            });

            // Advance offset past local header + name + extra + compressed payload
            offset += 30 + nameLen + extraLen + compSize;
            continue;
          }
        }
        offset++;
      }
    }

    const entryNames = entries.map((e) => e.name);
    const safety = ContentGuards.checkArchiveSafety(entryNames);
    const totalUncompressedBytes = entries.reduce((acc, e) => acc + e.sizeBytes, 0);

    const representations: ContentRepresentation[] = [];

    // Archive Index Representation
    const indexData = JSON.stringify(
      {
        format,
        entryCount: entries.length,
        totalUncompressedBytes,
        entries,
        safety,
      },
      null,
      2
    );

    representations.push({
      id: `rep_arc_${sha256.slice(0, 12)}`,
      type: "archive-index",
      mimeType: "application/json",
      sizeBytes: Buffer.byteLength(indexData, "utf8"),
      sha256: createHash("sha256").update(indexData).digest("hex"),
      data: indexData,
      metadata: {
        format,
        entryCount: entries.length,
        totalUncompressedBytes,
        isSafe: safety.isSafe,
      },
    });

    return {
      representations,
      metadata: {
        format,
        entryCount: entries.length,
        totalUncompressedBytes,
        isSafe: safety.isSafe,
        violations: safety.violations,
      },
    };
  }
}
