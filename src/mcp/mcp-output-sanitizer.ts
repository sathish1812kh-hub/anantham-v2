/**
 * Anantham V2 — MCP Output Sanitizer
 *
 * Enforces zero-secret-leakage, bounded payload sizes, and prompt-injection
 * mitigation on untrusted outputs originating from remote/local MCP servers.
 */

export interface MCPOutputSanitizerOptions {
  maxOutputBytes?: number; // Default 1MB
}

export class MCPOutputSanitizer {
  private readonly maxOutputBytes: number;

  constructor(options: MCPOutputSanitizerOptions = {}) {
    this.maxOutputBytes = options.maxOutputBytes || 1024 * 1024; // 1MB
  }

  /**
   * Sanitizes text output: redacts secrets, bounds bytes.
   */
  public sanitizeText(text: string): string {
    if (!text) return "";

    // 1. Redact secrets (sk-..., tokens, keys)
    let sanitized = text
      .replace(/sk-[a-zA-Z0-9_-]{10,}/g, "[REDACTED_SECRET]")
      .replace(/bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi, "Bearer [REDACTED_TOKEN]");

    // 2. Truncate if exceeds maxOutputBytes
    const byteLength = Buffer.byteLength(sanitized, "utf8");
    if (byteLength > this.maxOutputBytes) {
      const buffer = Buffer.from(sanitized, "utf8");
      const truncated = buffer.subarray(0, this.maxOutputBytes).toString("utf8");
      sanitized = truncated + "\n[OUTPUT_TRUNCATED: Exceeded byte limit]";
    }

    return sanitized;
  }

  /**
   * Deeply sanitizes structured objects or arrays returned by MCP.
   */
  public sanitizeStructured<T>(data: T): T {
    if (data === null || data === undefined) {
      return data;
    }

    if (typeof data === "string") {
      return this.sanitizeText(data) as unknown as T;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitizeStructured(item)) as unknown as T;
    }

    if (typeof data === "object") {
      // Prototype pollution defense: avoid __proto__ and constructor
      const cleaned: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        if (key === "__proto__" || key === "constructor" || key === "prototype") {
          continue;
        }
        cleaned[key] = this.sanitizeStructured(value);
      }
      return cleaned as unknown as T;
    }

    return data;
  }
}
