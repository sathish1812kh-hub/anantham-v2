import { extname } from "node:path";

export interface MimeSniffResult {
  mimeType: string;
  detectedBy: "magic" | "extension" | "text-heuristic" | "binary-fallback";
  confidence: number;
  isExecutable?: boolean;
}

export interface ArchiveEntryMeta {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
}

export interface ArchiveBombOptions {
  maxDecompressionRatio?: number; // e.g. 100
  maxTotalExpandedBytes?: number; // e.g. 100MB
  maxEntryCount?: number;         // e.g. 1000
}

export interface MimeSpoofCheckResult {
  isSpoofed: boolean;
  declaredMime?: string;
  detectedMime: string;
  risk: string | null;
}

export class ContentGuards {
  public static readonly DEFAULT_MAX_FILE_BYTES = 50 * 1024 * 1024; // 50MB
  public static readonly DEFAULT_MAX_TEXT_BYTES = 10 * 1024 * 1024; // 10MB
  public static readonly DEFAULT_MAX_DECOMPRESSION_RATIO = 100;      // 100:1 ratio
  public static readonly DEFAULT_MAX_EXPANDED_ARCHIVE_BYTES = 100 * 1024 * 1024; // 100MB
  public static readonly DEFAULT_MAX_ARCHIVE_ENTRIES = 1000;

  /**
   * Sniffs MIME type using magic byte signatures, file extension fallback, and text heuristics.
   * PRD Part 1 Section 10 & PRD Part 3 Section 136.
   */
  public static sniffMimeType(buffer: Buffer, filename?: string): MimeSniffResult {
    // 1. Check Magic Byte Signatures
    if (buffer.length >= 4) {
      // Windows Executable / DLL: MZ (0x4D 0x5A)
      if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
        return { mimeType: "application/x-dosexec", detectedBy: "magic", confidence: 1.0, isExecutable: true };
      }

      // Unix ELF: 0x7F 'E' 'L' 'F' (0x7F 0x45 0x4C 0x46)
      if (buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
        return { mimeType: "application/x-executable", detectedBy: "magic", confidence: 1.0, isExecutable: true };
      }

      // Mach-O Executable / Universal Binary
      const magic32 = buffer.readUInt32BE(0);
      if (
        magic32 === 0xfeedface ||
        magic32 === 0xfeedfacf ||
        magic32 === 0xcafebabe ||
        magic32 === 0xbebafeca
      ) {
        return { mimeType: "application/x-mach-binary", detectedBy: "magic", confidence: 1.0, isExecutable: true };
      }

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

    // 3. Text Heuristic Check (Printable ASCII / standard whitespace without null or control bytes)
    const checkLength = Math.min(buffer.length, 1024);
    let nonPrintableCount = 0;
    let hasNull = false;
    for (let i = 0; i < checkLength; i++) {
      const byte = buffer[i]!;
      if (byte === 0x00) {
        hasNull = true;
        break;
      }
      if (byte < 0x09 || (byte > 0x0d && byte < 0x20) || byte > 0x7e) {
        nonPrintableCount++;
      }
    }

    const isText = !hasNull && checkLength > 0 && nonPrintableCount / checkLength < 0.1;

    if (isText) {
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
   * Detects MIME spoofing where a declared MIME or filename extension contradicts actual magic bytes.
   * PRD Part 3 Section 136.
   */
  public static detectMimeSpoofing(
    buffer: Buffer,
    declaredMime?: string,
    filename?: string
  ): MimeSpoofCheckResult {
    const sniffResult = ContentGuards.sniffMimeType(buffer, filename);
    const detectedMime = sniffResult.mimeType;

    // Check if detected as executable disguised as non-executable
    if (sniffResult.isExecutable) {
      if (declaredMime && !declaredMime.includes("executable") && !declaredMime.includes("dosexec")) {
        return {
          isSpoofed: true,
          declaredMime,
          detectedMime,
          risk: `CRITICAL: Binary executable payload disguised as declared MIME '${declaredMime}'.`,
        };
      }
      if (filename) {
        const ext = extname(filename).toLowerCase();
        if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".pdf" || ext === ".txt") {
          return {
            isSpoofed: true,
            declaredMime,
            detectedMime,
            risk: `CRITICAL: Binary executable payload disguised as safe extension '${ext}'.`,
          };
        }
      }
    }

    // Check media / document spoofing
    if (declaredMime) {
      const isDeclaredImage = declaredMime.startsWith("image/");
      const isDetectedImage = detectedMime.startsWith("image/");
      const isDeclaredPdf = declaredMime === "application/pdf";
      const isDetectedPdf = detectedMime === "application/pdf";

      if (isDeclaredImage && !isDetectedImage && detectedMime !== "application/octet-stream") {
        return {
          isSpoofed: true,
          declaredMime,
          detectedMime,
          risk: `MIME mismatch: declared image MIME '${declaredMime}' but detected '${detectedMime}'.`,
        };
      }

      if (isDeclaredPdf && !isDetectedPdf) {
        return {
          isSpoofed: true,
          declaredMime,
          detectedMime,
          risk: `MIME mismatch: declared PDF but detected '${detectedMime}'.`,
        };
      }
    }

    return {
      isSpoofed: false,
      declaredMime,
      detectedMime,
      risk: null,
    };
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
      if (
        normalized.includes("../") ||
        normalized.startsWith("/") ||
        normalized.includes("/..") ||
        /^[a-zA-Z]:\//.test(normalized)
      ) {
        violations.push(`Zip Slip path traversal risk detected in entry: '${name}'`);
      }

      // Check for hidden malicious control scripts or executables in archives
      const lower = normalized.toLowerCase();
      const dangerousExtensions = [
        ".exe", ".bat", ".cmd", ".vbs", ".ps1", ".sh", ".dll", ".so", ".dylib", ".scr", ".com", ".pif"
      ];
      if (dangerousExtensions.some(ext => lower.endsWith(ext))) {
        violations.push(`Restricted executable entry detected in archive: '${name}'`);
      }
    }

    return {
      isSafe: violations.length === 0,
      violations,
    };
  }

  /**
   * Evaluates archive entries against zip bomb / decompression amplification attacks.
   * PRD Part 3 Section 138.
   */
  public static checkArchiveBomb(
    entries: ArchiveEntryMeta[],
    options?: ArchiveBombOptions
  ): { isBomb: boolean; violations: string[] } {
    const violations: string[] = [];
    const maxRatio = options?.maxDecompressionRatio ?? ContentGuards.DEFAULT_MAX_DECOMPRESSION_RATIO;
    const maxTotalBytes = options?.maxTotalExpandedBytes ?? ContentGuards.DEFAULT_MAX_EXPANDED_ARCHIVE_BYTES;
    const maxEntries = options?.maxEntryCount ?? ContentGuards.DEFAULT_MAX_ARCHIVE_ENTRIES;

    if (entries.length > maxEntries) {
      violations.push(`Archive entry count (${entries.length}) exceeds safety limit of ${maxEntries} entries.`);
    }

    let totalCompressed = 0;
    let totalUncompressed = 0;

    for (const entry of entries) {
      totalCompressed += entry.compressedSize;
      totalUncompressed += entry.uncompressedSize;

      // Check individual entry compression ratio
      if (entry.compressedSize > 0) {
        const ratio = entry.uncompressedSize / entry.compressedSize;
        if (ratio > maxRatio && entry.uncompressedSize > 1024 * 1024) { // Only flag if uncompressed > 1MB
          violations.push(
            `Archive entry '${entry.name}' has anomalous compression ratio of ${ratio.toFixed(1)}:1 (limit: ${maxRatio}:1).`
          );
        }
      }
    }

    if (totalUncompressed > maxTotalBytes) {
      violations.push(
        `Total uncompressed archive size of ${totalUncompressed} bytes exceeds safety limit of ${maxTotalBytes} bytes.`
      );
    }

    if (totalCompressed > 0) {
      const overallRatio = totalUncompressed / totalCompressed;
      if (overallRatio > maxRatio && totalUncompressed > 10 * 1024 * 1024) {
        violations.push(
          `Overall archive decompression ratio of ${overallRatio.toFixed(1)}:1 exceeds safety limit of ${maxRatio}:1.`
        );
      }
    }

    return {
      isBomb: violations.length > 0,
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
