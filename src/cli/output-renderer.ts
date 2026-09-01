import { type CliOutputMode, type CommandExecutionResult } from "../domain/cli.js";

export interface OutputRendererOptions {
  mode?: CliOutputMode;
  redactSecrets?: boolean;
}

/**
 * Structured Output Renderer.
 * PRD Part 2 Section 175.
 */
export class OutputRenderer {
  private mode: CliOutputMode;
  private readonly redactSecrets: boolean;

  constructor(options: OutputRendererOptions = {}) {
    this.mode = options.mode ?? "text";
    this.redactSecrets = options.redactSecrets ?? true;
  }

  public setMode(mode: CliOutputMode): void {
    this.mode = mode;
  }

  public getMode(): CliOutputMode {
    return this.mode;
  }

  /**
   * Render a command execution result.
   */
  public renderResult(result: CommandExecutionResult): string {
    const sanitizedResult = this.redactSecrets ? this.sanitize(result) : result;

    switch (this.mode) {
      case "json":
        return JSON.stringify(sanitizedResult, null, 2);
      case "jsonl":
        return JSON.stringify(sanitizedResult);
      case "text":
      default:
        return this.renderText(sanitizedResult);
    }
  }

  /**
   * Render arbitrary data according to current output mode.
   */
  public renderData(data: unknown, title?: string): string {
    const sanitized = this.redactSecrets ? this.sanitize(data) : data;

    switch (this.mode) {
      case "json":
        return JSON.stringify(sanitized, null, 2);
      case "jsonl":
        return JSON.stringify(sanitized);
      case "text":
      default:
        if (title) {
          return `=== ${title} ===\n` + this.formatAsText(sanitized);
        }
        return this.formatAsText(sanitized);
    }
  }

  /**
   * Format human-readable text output.
   */
  private renderText(result: CommandExecutionResult): string {
    const lines: string[] = [];

    if (result.success) {
      if (result.message) {
        lines.push(`✔ ${result.message}`);
      } else {
        lines.push(`✔ Command /${result.commandName} succeeded.`);
      }

      if (result.data !== undefined && result.data !== null) {
        lines.push(this.formatAsText(result.data));
      }
    } else {
      lines.push(`✖ Command /${result.commandName} failed: ${result.error || "Unknown error"}`);
      if (result.classification) {
        lines.push(`  Classification: ${result.classification}`);
      }
    }

    return lines.join("\n");
  }

  private formatAsText(data: unknown): string {
    if (typeof data === "string") return data;
    if (typeof data === "number" || typeof data === "boolean") return String(data);
    if (data === null || data === undefined) return "";

    if (Array.isArray(data)) {
      if (data.length === 0) return "(empty list)";
      return data
        .map((item, idx) => {
          if (typeof item === "object" && item !== null) {
            return `[${idx + 1}] ` + JSON.stringify(item);
          }
          return `• ${String(item)}`;
        })
        .join("\n");
    }

    if (typeof data === "object") {
      return JSON.stringify(data, null, 2);
    }

    return String(data);
  }

  /**
   * Recursively redact secret fields.
   */
  private sanitize<T>(val: T): T {
    if (val === null || val === undefined) return val;
    if (typeof val !== "object") return val;

    if (Array.isArray(val)) {
      return val.map((item) => this.sanitize(item)) as unknown as T;
    }

    const sanitizedObj: Record<string, unknown> = {};
    const secretKeyPatterns = [/token/i, /secret/i, /key/i, /auth/i, /password/i, /credential/i];

    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      const isSecretKey = secretKeyPatterns.some((p) => p.test(k));
      if (isSecretKey && typeof v === "string" && v.length > 0) {
        sanitizedObj[k] = "[REDACTED]";
      } else if (typeof v === "object" && v !== null) {
        sanitizedObj[k] = this.sanitize(v);
      } else {
        sanitizedObj[k] = v;
      }
    }

    return sanitizedObj as T;
  }
}
