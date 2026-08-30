import { ContentGuards } from "../content/content-guards.js";

export interface ToolPruneOptions {
  maxChars?: number;
  artifactRefUri?: string;
  preserveErrors?: boolean;
}

export interface ToolPruneResult {
  content: string;
  wasPruned: boolean;
  estimatedTokens: number;
  originalSizeBytes: number;
  prunedSizeBytes: number;
}

export class ToolResultPruner {
  private static readonly DEFAULT_MAX_CHARS = 4000;

  /**
   * Intelligently prunes large tool execution results while preserving critical status,
   * error messages, diagnostic traces, and artifact references.
   * PRD Part 1 Section 78.
   */
  public static prune(rawResult: string | Record<string, unknown>, options?: ToolPruneOptions): ToolPruneResult {
    const maxChars = options?.maxChars ?? this.DEFAULT_MAX_CHARS;
    const text = typeof rawResult === "string" ? rawResult : JSON.stringify(rawResult, null, 2);
    const originalSizeBytes = Buffer.byteLength(text, "utf8");

    if (text.length <= maxChars) {
      return {
        content: text,
        wasPruned: false,
        estimatedTokens: ContentGuards.estimateTokens(text),
        originalSizeBytes,
        prunedSizeBytes: originalSizeBytes,
      };
    }

    // Extract error traces if present
    const lines = text.split("\n");
    const errorLines = lines.filter(
      (l) => /error|fail|exception|fatal|panic|traceback|syntaxerror|typeerror/i.test(l)
    );

    const headChars = Math.floor(maxChars * 0.4);
    const tailChars = Math.floor(maxChars * 0.4);

    const head = text.slice(0, headChars);
    const tail = text.slice(text.length - tailChars);

    let summaryBlock = `\n... [TRUNCATED: ${text.length - headChars - tailChars} characters pruned due to token budget] ...\n`;

    if (options?.artifactRefUri) {
      summaryBlock += `[Full tool output persisted at: ${options.artifactRefUri}]\n`;
    }

    if (errorLines.length > 0 && options?.preserveErrors !== false) {
      const distinctErrors = Array.from(new Set(errorLines)).slice(0, 10).join("\n");
      summaryBlock += `\n[Extracted Error Highlights]:\n${distinctErrors}\n`;
    }

    const prunedContent = `${head}${summaryBlock}${tail}`;
    const prunedSizeBytes = Buffer.byteLength(prunedContent, "utf8");

    return {
      content: prunedContent,
      wasPruned: true,
      estimatedTokens: ContentGuards.estimateTokens(prunedContent),
      originalSizeBytes,
      prunedSizeBytes,
    };
  }
}
