import { createHash } from "node:crypto";
import { extname } from "node:path";
import type { ContentRepresentation } from "../../domain/content.js";
import { ContentGuards } from "../content-guards.js";

export interface TextParseResult {
  representations: ContentRepresentation[];
  metadata: {
    lineCount: number;
    characterCount: number;
    estimatedTokens: number;
    language?: string;
    isCode: boolean;
    isMarkdown: boolean;
  };
}

export class TextParser {
  /**
   * Ingests plaintext, markdown, or code buffers and extracts structured representations.
   * PRD Part 1 Section 11.
   */
  public static parse(buffer: Buffer, filename?: string, mimeType?: string): TextParseResult {
    const rawText = buffer.toString("utf8");
    const lines = rawText.split(/\r?\n/);
    const lineCount = lines.length;
    const characterCount = rawText.length;
    const estimatedTokens = ContentGuards.estimateTokens(rawText);

    const ext = filename ? extname(filename).toLowerCase() : "";
    const isMarkdown = ext === ".md" || ext === ".markdown" || mimeType === "text/markdown";

    const codeExtensions: Record<string, string> = {
      ".ts": "typescript",
      ".tsx": "typescript",
      ".js": "javascript",
      ".jsx": "javascript",
      ".py": "python",
      ".rs": "rust",
      ".go": "go",
      ".java": "java",
      ".c": "c",
      ".cpp": "cpp",
      ".cs": "csharp",
      ".html": "html",
      ".css": "css",
      ".sql": "sql",
      ".sh": "bash",
      ".ps1": "powershell",
      ".yaml": "yaml",
      ".yml": "yaml",
    };

    const isCode = Boolean(codeExtensions[ext] || mimeType?.includes("javascript") || mimeType?.includes("typescript") || mimeType?.includes("python"));
    const language = codeExtensions[ext] || (isCode ? "code" : undefined);

    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const representations: ContentRepresentation[] = [];

    // 1. Raw Text Representation
    representations.push({
      id: `rep_txt_${createHash("sha256").update(rawText).digest("hex").slice(0, 12)}`,
      type: "text",
      mimeType: mimeType || "text/plain",
      sizeBytes: buffer.length,
      sha256,
      data: rawText,
      metadata: {
        lineCount,
        characterCount,
        estimatedTokens,
        language,
      },
    });

    // 2. Markdown Representation (formatted with code fence if code)
    if (isMarkdown) {
      representations.push({
        id: `rep_md_${createHash("sha256").update(rawText).digest("hex").slice(0, 12)}`,
        type: "markdown",
        mimeType: "text/markdown",
        sizeBytes: buffer.length,
        sha256,
        data: rawText,
        metadata: { lineCount, characterCount },
      });
    } else if (isCode && language) {
      const fencedMarkdown = `\`\`\`${language}\n${rawText}\n\`\`\``;
      const mdSha256 = createHash("sha256").update(fencedMarkdown).digest("hex");
      representations.push({
        id: `rep_md_${mdSha256.slice(0, 12)}`,
        type: "markdown",
        mimeType: "text/markdown",
        sizeBytes: Buffer.byteLength(fencedMarkdown, "utf8"),
        sha256: mdSha256,
        data: fencedMarkdown,
        metadata: { language, isFenced: true },
      });
    }

    return {
      representations,
      metadata: {
        lineCount,
        characterCount,
        estimatedTokens,
        language,
        isCode,
        isMarkdown,
      },
    };
  }
}
