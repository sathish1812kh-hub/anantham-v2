/**
 * Code Intelligence Fault Isolator
 * PRD-INV-001: Strict Code Intelligence Invariants & Fault Isolation
 */

import type { ParseResult } from "./types.js";

export interface FaultIsolationOptions {
  timeoutMs?: number;
  maxFileSizeChars?: number;
  rejectBinary?: boolean;
}

export class CodeIntelFaultIsolator {
  private timeoutMs: number;
  private maxFileSizeChars: number;
  private rejectBinary: boolean;

  constructor(options: FaultIsolationOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.maxFileSizeChars = options.maxFileSizeChars ?? 5 * 1024 * 1024; // 5MB limit
    this.rejectBinary = options.rejectBinary ?? true;
  }

  public async executeIsolatedParse(
    filePath: string,
    content: string,
    parseFn: (filePath: string, content: string) => Promise<ParseResult> | ParseResult
  ): Promise<ParseResult> {
    // Invariant 1: Reject binary content before parser
    if (this.rejectBinary && this.isBinary(content)) {
      return {
        filePath,
        language: "unknown",
        symbols: [],
        imports: [],
        exports: [],
        calls: [],
        diagnostics: [
          {
            filePath,
            range: { start: { line: 1, character: 1 }, end: { line: 1, character: 1 } },
            message: "Binary file rejected from AST parsing",
            severity: "warning",
            source: "FaultIsolator",
          },
        ],
        isPartial: true,
        error: "Binary content rejected",
      };
    }

    // Invariant 2: Guard against oversized files causing out-of-memory
    if (content.length > this.maxFileSizeChars) {
      return {
        filePath,
        language: "unknown",
        symbols: [],
        imports: [],
        exports: [],
        calls: [],
        diagnostics: [
          {
            filePath,
            range: { start: { line: 1, character: 1 }, end: { line: 1, character: 1 } },
            message: `File size (${content.length} chars) exceeds maximum allowed parser threshold (${this.maxFileSizeChars})`,
            severity: "error",
            source: "FaultIsolator",
          },
        ],
        isPartial: true,
        error: "File size exceeds threshold",
      };
    }

    // Invariant 3: Execute parser with timeout protection
    const startTime = Date.now();

    const parsePromise = new Promise<ParseResult>(async (resolve) => {
      try {
        const res = await parseFn(filePath, content);
        resolve(res);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        resolve({
          filePath,
          language: "unknown",
          symbols: [],
          imports: [],
          exports: [],
          calls: [],
          diagnostics: [
            {
              filePath,
              range: { start: { line: 1, character: 1 }, end: { line: 1, character: 1 } },
              message: `Parser threw exception: ${errorMsg}`,
              severity: "error",
              source: "FaultIsolator",
            },
          ],
          isPartial: true,
          error: errorMsg,
        });
      }
    });

    const timeoutPromise = new Promise<ParseResult>((resolve) => {
      setTimeout(() => {
        resolve({
          filePath,
          language: "unknown",
          symbols: [],
          imports: [],
          exports: [],
          calls: [],
          diagnostics: [
            {
              filePath,
              range: { start: { line: 1, character: 1 }, end: { line: 1, character: 1 } },
              message: `Parser timed out after ${this.timeoutMs}ms`,
              severity: "error",
              source: "FaultIsolator",
            },
          ],
          isPartial: true,
          error: `Parser timeout (${this.timeoutMs}ms)`,
        });
      }, this.timeoutMs);
    });

    const finalResult = await Promise.race([parsePromise, timeoutPromise]);

    // Also check if synchronous execution exceeded threshold
    if (Date.now() - startTime > this.timeoutMs && !finalResult.isPartial) {
      return {
        filePath,
        language: "unknown",
        symbols: [],
        imports: [],
        exports: [],
        calls: [],
        diagnostics: [
          {
            filePath,
            range: { start: { line: 1, character: 1 }, end: { line: 1, character: 1 } },
            message: `Parser execution exceeded deadline (${Date.now() - startTime}ms > ${this.timeoutMs}ms)`,
            severity: "error",
            source: "FaultIsolator",
          },
        ],
        isPartial: true,
        error: `Parser timeout (${this.timeoutMs}ms)`,
      };
    }

    return finalResult;
  }

  private isBinary(content: string): boolean {
    const len = Math.min(content.length, 8192);
    for (let i = 0; i < len; i++) {
      if (content.charCodeAt(i) === 0) {
        return true;
      }
    }
    return false;
  }
}
