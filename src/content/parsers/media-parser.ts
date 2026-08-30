import { createHash } from "node:crypto";
import type { ContentRepresentation } from "../../domain/content.js";

export interface MediaParseResult {
  representations: ContentRepresentation[];
  metadata: {
    mediaType: "audio" | "video";
    container: string;
    sizeBytes: number;
    sampleRateHz?: number;
    channels?: number;
  };
}

export class MediaParser {
  /**
   * Parses audio and video binary headers and generates media metadata representations.
   * PRD Part 1 Section 11 & Section 12.
   */
  public static parse(buffer: Buffer, mimeType: string): MediaParseResult {
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const isVideo = mimeType.startsWith("video/");
    const mediaType: "audio" | "video" = isVideo ? "video" : "audio";

    let container = "unknown";
    if (mimeType.includes("mp3") || mimeType.includes("mpeg")) container = "mp3";
    else if (mimeType.includes("wav") || mimeType.includes("wave")) container = "wav";
    else if (mimeType.includes("mp4")) container = "mp4";
    else if (mimeType.includes("webm")) container = "webm";

    let sampleRateHz: number | undefined;
    let channels: number | undefined;

    // WAV Header parsing (bytes 22..28: channels, sample rate)
    if (container === "wav" && buffer.length >= 28) {
      channels = buffer.readUInt16LE(22);
      sampleRateHz = buffer.readUInt32LE(24);
    }

    const representations: ContentRepresentation[] = [];

    // Media representation
    representations.push({
      id: `rep_${mediaType}_${sha256.slice(0, 12)}`,
      type: mediaType,
      mimeType,
      sizeBytes: buffer.length,
      sha256,
      metadata: {
        container,
        mediaType,
        sampleRateHz,
        channels,
      },
    });

    // Metadata JSON representation
    const metaStr = JSON.stringify({
      container,
      mediaType,
      sizeBytes: buffer.length,
      sampleRateHz,
      channels,
    });
    representations.push({
      id: `rep_meta_${sha256.slice(0, 12)}`,
      type: "metadata",
      mimeType: "application/json",
      sizeBytes: Buffer.byteLength(metaStr, "utf8"),
      sha256: createHash("sha256").update(metaStr).digest("hex"),
      data: metaStr,
      metadata: { container, mediaType },
    });

    return {
      representations,
      metadata: {
        mediaType,
        container,
        sizeBytes: buffer.length,
        sampleRateHz,
        channels,
      },
    };
  }
}
