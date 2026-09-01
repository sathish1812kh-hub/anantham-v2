/**
 * TUI Output Sanitizer & Terminal Escape Injection Defense.
 * PRD Part 1 Section 30 & PRD Part 2 Section 186.
 */
export class TuiSanitizer {
  // Regex matching ANSI escape codes (CSI, OSC, etc.)
  private static readonly ANSI_REGEX =
    // eslint-disable-next-line no-control-regex
    /[\u001B\u009B][[\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*|[a-zA-Z\d]+(?:;[-a-zA-Z\d\/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

  // Regex matching OSC sequences
  // eslint-disable-next-line no-control-regex
  private static readonly OSC_REGEX = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

  // Regex matching non-printable/dangerous control characters (excluding newline \n and tab \t)
  // eslint-disable-next-line no-control-regex
  private static readonly CONTROL_CHAR_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

  /**
   * Strip all ANSI escape sequences, OSC codes, and raw control characters from text.
   */
  public static sanitize(text: string): string {
    if (typeof text !== "string") return "";
    return text
      .replace(this.OSC_REGEX, "")
      .replace(this.ANSI_REGEX, "")
      .replace(this.CONTROL_CHAR_REGEX, "");
  }

  /**
   * Truncate string with ellipsis if exceeding maxLength without breaking character layout.
   */
  public static truncate(text: string, maxLength: number): string {
    const clean = this.sanitize(text);
    if (clean.length <= maxLength) return clean;
    if (maxLength <= 3) return clean.slice(0, maxLength);
    return clean.slice(0, maxLength - 3) + "...";
  }

  /**
   * Pad string to fixed width after sanitization.
   */
  public static pad(text: string, width: number): string {
    const clean = this.sanitize(text);
    if (clean.length >= width) return clean.slice(0, width);
    return clean + " ".repeat(width - clean.length);
  }
}
