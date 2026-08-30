import { extname } from "node:path";

export interface MimeSniffResult {
  mimeType: string;
  detectedBy: "magic" | "extension" | "text-heuristic" | "binary-fallback";
  confidence: number;
}

export class ContentGuards {
  public static readonly DEFAULT_MAX_FILE_BYTES = 50 * 1024 * 1024; // 50MB
  public static readonly DEFAULT_MAX_TEXT_BYTES = 10 * 1024 * 1024; // 10MB

  /**
   * Sniffs MIME type using magic byte signatures, file extension fallback, and text heuristics.
   * PRD Part 1 Section 10 & PRD Part 3 Section 136.
   */
  public static sniffMimeType(buffer: Buffer, filename?: string): MimeSniffResult {
    // 1. Check Magic Byte Signatures
    if (buffer.length >= 4) {
      // PDF: %PDF- (0x25 0x50 0x44 0x46)
      if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
        return { mimeType: "application/pdf", detectedBy: "magic", confidence: 1.0 };
      }

      // PNG: 0x89 0x50 0x4E 0x47
      if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
        return { mimeType: "image/png", detectedBy: "magic", confidence: 1.0 };
      }

      // JPEG: 0xFF 0xD8 0xFF
      if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return { mimeType: "image/jpeg", detectedBy: "magic", confidence: 1.0 };
      }

      // GIF: GIF87a or GIF89a
      if (
        buffer[0] === 0x47 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x38
      ) {
        return { mimeType: "image/gif", detectedBy: "magic", confidence: 1.0 };
      }

      // ZIP / DOCX / XLSX / JAR: PK\x03\x04
      if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
        if (filename) {
          const ext = extname(filename).toLowerCase();
          if (ext === ".docx") return { mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", detectedBy: "magic", confidence: 0.95 };
          if (ext === ".xlsx") return { mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", detectedBy: "magic", confidence: 0.95 };
        }
        return { mimeType: "application/zip", detectedBy: "magic", confidence: 1.0 };
      }

      // GZIP: 0x1F 0x8B
      if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
        return { mimeType: "application/gzip", detectedBy: "magic", confidence: 1.0 };
      }

      // WebP / RIFF: 0x52 0x49 0x46 0x46
      if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
        if (buffer.length >= 12 && buffer.toString("ascii", 8, 12) === "WEBP") {
          return { mimeType: "image/webp", detectedBy: "magic", confidence: 1.0 };
        }
        if (buffer.length >= 12 && buffer.toString("ascii", 8, 12) === "WAVE") {
          return { mimeType: "audio/wav", detectedBy: "magic", confidence: 1.0 };
        }
      }
    }

    // 2. Extension based detection
    if (filename) {
      const ext = extname(filename).toLowerCase();
      const extMimes: Record<string, string> = {
        ".txt": "text/plain",
        ".md": "text/markdown",
        ".markdown": "text/markdown",
        ".json": "application/json",
        ".csv": "text/csv",
        ".tsv": "text/tab-separated-values",
        ".ts": "text/typescript",
        ".tsx": "text/typescript-jsx",
        ".js": "text/javascript",
        ".jsx": "text/javascript-jsx",
        ".html": "text/html",
        ".css": "text/css",
        ".xml": "application/xml",
        ".yaml": "application/x-yaml",
        ".yml": "application/x-yaml",
        ".sql": "application/sql",
        ".sh": "application/x-sh",
        ".ps1": "application/x-powershell",
        ".py": "text/x-python",
        ".rs": "text/x-rust",
        ".go": "text/x-go",
        ".java": "text/x-java-source",
        ".c": "text/x-c",
        ".cpp": "text/x-c++",
        ".h": "text/x-c-header",
        ".mp3": "audio/mpeg",
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".svg": "image/svg+xml",
      };

      if (extMimes[ext]) {
        return { mimeType: extMimes[ext], detectedBy: "extension", confidence: 0.9 };
      }
    }

    // 3. Text Heuristic Check (UTF-8 valid without null bytes)
    const checkLength = Math.min(buffer.length, 1024);
    let isAsciiText = true;
    for (let i = 0; i < checkLength; i++) {
      const byte = buffer[i];
      if (byte === 0x00) {
        isAsciiText = false;
        break;
      }
    }

    if (isAsciiText) {
      // Check if it starts with { or [ for JSON
      const sample = buffer.toString("utf8", 0, Math.min(buffer.length, 256)).trim();
      if (sample.startsWith("{") || sample.startsWith("[")) {
        try {
          JSON.parse(buffer.toString("utf8"));
          return { mimeType: "application/json", detectedBy: "text-heuristic", confidence: 0.95 };
        } catch {
          // not valid json, treat as plain text
        }
      }
      return { mimeType: "text/plain", detectedBy: "text-heuristic", confidence: 0.75 };
    }

    // 4. Binary Fallback
    return { mimeType: "application/octet-stream", detectedBy: "binary-fallback", confidence: 0.5 };
  }

  /**
   * Enforces file size boundaries.
   */
  public static validateSize(sizeBytes: number, maxBytes = ContentGuards.DEFAULT_MAX_FILE_BYTES): void {
    if (sizeBytes > maxBytes) {
      throw new Error(`Content size of ${sizeBytes} bytes exceeds maximum allowed limit of ${maxBytes} bytes.`);
    }
  }

  /**
   * Checks archive entry paths for Zip Slip path traversal and dangerous files.
   * PRD Part 1 Section 13 & PRD Part 3 Section 138.
   */
  public static checkArchiveSafety(entryNames: string[]): { isSafe: boolean; violations: string[] } {
    const violations: string[] = [];

    for (const name of entryNames) {
      // Normalize slashes
      const normalized = name.replace(/\\/g, "/");

      // Check for path traversal (Zip Slip)
      if (normalized.includes("../") || normalized.startsWith("/") || normalized.includes("/..")) {
        violations.push(`Zip Slip path traversal risk detected in entry: '${name}'`);
      }

      // Check for hidden malicious control scripts or executables in archives
      const lower = normalized.toLowerCase();
      if (lower.endsWith(".exe") || lower.endsWith(".bat") || lower.endsWith(".cmd") || lower.endsWith(".vbs")) {
        violations.push(`Restricted executable entry detected in archive: '${name}'`);
      }
    }

    return {
      isSafe: violations.length === 0,
      violations,
    };
  }

  /**
   * Heuristically estimates tokens for a string payload (~4 chars per token).
   */
  public static estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }
}
