import { createHash } from "node:crypto";
import {
  type ContentObject,
  type ContentKind,
  type ContentSource,
  ContentObjectSchema,
} from "../domain/content.js";
import type { SensitivityLevel, TrustLevel } from "../domain/security.js";
import { ContentGuards } from "./content-guards.js";
import { TextParser } from "./parsers/text-parser.js";
import { StructuredDataParser } from "./parsers/structured-parser.js";
import { PdfParser } from "./parsers/pdf-parser.js";
import { ImageParser } from "./parsers/image-parser.js";
import { MediaParser } from "./parsers/media-parser.js";
import { ArchiveParser } from "./parsers/archive-parser.js";
import { BinaryParser } from "./parsers/binary-parser.js";

export interface ContentIngestRequest {
  data: Buffer | string;
  name: string;
  source: ContentSource;
  projectId?: string;
  sessionId?: string;
  taskId?: string;
  actor?: string;
  sensitivity?: SensitivityLevel;
  trust?: TrustLevel;
  maxSizeBytes?: number;
}

export class ContentIngestionEngine {
  /**
   * Ingests multimodal content, performs security validation, extracts structured representations,
   * binds provenance, and produces a validated, immutable ContentObject.
   * PRD Part 1 Section 10-13 & PRD Part 3 Section 135-140.
   */
  public static async ingest(request: ContentIngestRequest): Promise<ContentObject> {
    const buffer = Buffer.isBuffer(request.data)
      ? request.data
      : Buffer.from(request.data, "utf8");

    // 1. Enforce Size Guard
    ContentGuards.validateSize(buffer.length, request.maxSizeBytes);

    // 2. Compute Deterministic SHA-256 Digest
    const sha256 = createHash("sha256").update(buffer).digest("hex");

    // 3. Sniff MIME Type and Classify Kind
    const sniffResult = ContentGuards.sniffMimeType(buffer, request.name);
    const mimeType = sniffResult.mimeType;

    let kind: ContentKind = "binary";
    if (
      mimeType === "application/json" ||
      mimeType === "text/csv" ||
      mimeType === "text/tab-separated-values"
    ) {
      kind = "table";
    } else if (
      mimeType.startsWith("text/code") ||
      mimeType.includes("javascript") ||
      mimeType.includes("typescript") ||
      mimeType.includes("python") ||
      mimeType.includes("rust") ||
      mimeType.includes("golang") ||
      mimeType.includes("sql")
    ) {
      kind = "code";
    } else if (mimeType.startsWith("text/")) {
      kind = "text";
    } else if (
      mimeType === "application/pdf" ||
      mimeType.includes("wordprocessingml") ||
      mimeType.includes("spreadsheetml")
    ) {
      kind = "document";
    } else if (mimeType.startsWith("image/")) {
      kind = "image";
    } else if (mimeType.startsWith("audio/")) {
      kind = "audio";
    } else if (mimeType.startsWith("video/")) {
      kind = "video";
    } else if (
      mimeType === "application/zip" ||
      mimeType === "application/gzip" ||
      mimeType.includes("tar")
    ) {
      kind = "archive";
    }

    // 4. Dispatch to Specialized Parser
    let representations = [];

    switch (kind) {
      case "text":
      case "code": {
        const res = TextParser.parse(buffer, request.name, mimeType);
        representations = res.representations;
        break;
      }

      case "table": {
        const format =
          mimeType === "text/csv"
            ? "csv"
            : mimeType === "text/tab-separated-values"
            ? "tsv"
            : "json";
        const res = StructuredDataParser.parse(buffer, format);
        representations = res.representations;
        break;
      }

      case "document": {
        if (mimeType === "application/pdf") {
          const res = PdfParser.parse(buffer);
          representations = res.representations;
        } else {
          const res = BinaryParser.parse(buffer, mimeType);
          representations = res.representations;
        }
        break;
      }

      case "image": {
        const res = ImageParser.parse(buffer, mimeType);
        representations = res.representations;
        break;
      }

      case "audio":
      case "video": {
        const res = MediaParser.parse(buffer, mimeType);
        representations = res.representations;
        break;
      }

      case "archive": {
        const res = ArchiveParser.parse(buffer, mimeType);
        representations = res.representations;
        break;
      }

      default: {
        const res = BinaryParser.parse(buffer, mimeType);
        representations = res.representations;
        break;
      }
    }

    // 5. Construct ContentObject with Provenance and Security
    const id = `cnt_${sha256.slice(0, 16)}`;
    const now = new Date().toISOString();

    const trust: TrustLevel =
      request.trust ||
      (request.source.type === "upload" || request.source.type === "clipboard"
        ? "user-content"
        : request.source.type === "filesystem"
        ? "repository-content"
        : request.source.type === "browser"
        ? "web-content"
        : request.source.type === "mcp"
        ? "mcp-content"
        : "trusted");

    const contentObject: ContentObject = {
      id,
      kind,
      mimeType,
      name: request.name,
      sizeBytes: buffer.length,
      sha256,
      source: request.source,
      representations,
      provenance: {
        sourceType: request.source.type,
        sourceId: request.actor,
        sourceUri: request.source.uri,
        parentIds: [],
        capturedAt: now,
        extractor: {
          name: "content-ingestion-engine",
          version: "2.0.0",
        },
        transformations: [`parsed:${kind}`],
      },
      security: {
        trust,
        sensitivity: request.sensitivity || "normal",
        scanned: true,
        scanVersion: "1.0.0",
        authority: request.source.type === "upload" ? "attachment" : "tool-output",
      },
      createdAt: now,
      updatedAt: now,
    };

    return Object.freeze(ContentObjectSchema.parse(contentObject));
  }
}
