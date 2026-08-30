import { createHash } from "node:crypto";
import type { ContentRepresentation } from "../../domain/content.js";

export interface PdfParseResult {
  representations: ContentRepresentation[];
  metadata: {
    pdfVersion: string;
    estimatedPageCount: number;
    hasTextStream: boolean;
    encrypted: boolean;
  };
}

export class PdfParser {
  /**
   * Safely inspects PDF headers and streams, extracting metadata and page descriptors.
   * PRD Part 1 Section 11 & PRD Part 3 Section 136.
   */
  public static parse(buffer: Buffer): PdfParseResult {
    const rawContent = buffer.toString("binary");
    const sha256 = createHash("sha256").update(buffer).digest("hex");

    // 1. Extract PDF Version from header
    const headerMatch = rawContent.match(/^%PDF-([0-9.]+)/);
    const pdfVersion: string = headerMatch && headerMatch[1] ? headerMatch[1] : "unknown";

    // 2. Count pages by matching /Type /Page (excluding /Type /Pages)
    const pageMatches = rawContent.match(/\/Type\s*\/Page\b/g);
    const estimatedPageCount = pageMatches ? pageMatches.length : 1;

    // 3. Check for encryption (/Encrypt)
    const encrypted = /\/Encrypt\b/.test(rawContent);

    // 4. Simple text stream extraction heuristic (look for BT ... ET blocks)
    const textBlocks: string[] = [];
    const textMatches = rawContent.matchAll(/BT\s*([\s\S]*?)\s*ET/g);
    for (const match of textMatches) {
      if (match[1]) {
        // Extract string literals inside parentheses: (text)
        const strMatches = match[1].matchAll(/\((.*?)\)/g);
        for (const sm of strMatches) {
          if (sm[1] && sm[1].trim().length > 0) {
            textBlocks.push(sm[1]);
          }
        }
      }
    }

    const hasTextStream = textBlocks.length > 0;
    const extractedText = textBlocks.join(" ");

    const representations: ContentRepresentation[] = [];

    // Document Pages / Metadata Representation
    representations.push({
      id: `rep_doc_${sha256.slice(0, 12)}`,
      type: "document-pages",
      mimeType: "application/pdf",
      sizeBytes: buffer.length,
      sha256,
      metadata: {
        pdfVersion,
        pageCount: estimatedPageCount,
        encrypted,
        extractedTextSample: extractedText.slice(0, 500),
      },
    });

    // If text was extracted, provide text representation
    if (hasTextStream && extractedText.length > 0) {
      const textSha = createHash("sha256").update(extractedText).digest("hex");
      representations.push({
        id: `rep_txt_${textSha.slice(0, 12)}`,
        type: "text",
        mimeType: "text/plain",
        sizeBytes: Buffer.byteLength(extractedText, "utf8"),
        sha256: textSha,
        data: extractedText,
        metadata: { source: "pdf-stream-extraction" },
      });
    }

    return {
      representations,
      metadata: {
        pdfVersion,
        estimatedPageCount,
        hasTextStream,
        encrypted,
      },
    };
  }
}
