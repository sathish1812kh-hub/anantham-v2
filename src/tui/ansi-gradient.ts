/**
 * Anantham V2 — Antigravity TrueColor ANSI Gradient Engine.
 * Provides 24-bit TrueColor RGB color interpolation, progress bars, and sparklines.
 */

export type RGB = [number, number, number];

export interface ColorStop {
  position: number; // 0 to 1
  color: RGB;
}

export class AnsiGradient {
  public static readonly PALETTES = {
    cyanBlue: [
      [0, 242, 254],
      [79, 172, 254],
    ] as [RGB, RGB],
    neonPinkViolet: [
      [247, 37, 133],
      [114, 9, 183],
    ] as [RGB, RGB],
    amberCoral: [
      [255, 154, 60],
      [255, 94, 98],
    ] as [RGB, RGB],
    emeraldMint: [
      [0, 242, 152],
      [79, 254, 180],
    ] as [RGB, RGB],
    graphiteOnyx: [
      [26, 26, 30],
      [10, 10, 12],
    ] as [RGB, RGB],
  };

  /**
   * Determine if current terminal supports TrueColor (24-bit).
   */
  public static isTrueColorSupported(): boolean {
    const colorTerm = process.env.COLORTERM?.toLowerCase();
    if (colorTerm === "truecolor" || colorTerm === "24bit") {
      return true;
    }
    if (process.env.TERM_PROGRAM === "vscode" || process.env.WT_SESSION) {
      return true;
    }
    // Default to true in modern Windows and macOS terminals unless explicitly dumb
    if (process.env.TERM === "dumb") {
      return false;
    }
    return true;
  }

  /**
   * Format text with foreground 24-bit TrueColor.
   */
  public static colorRgb(text: string, [r, g, b]: RGB): string {
    return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
  }

  /**
   * Format text with background 24-bit TrueColor.
   */
  public static bgRgb(text: string, [r, g, b]: RGB): string {
    return `\x1b[48;2;${r};${g};${b}m${text}\x1b[0m`;
  }

  /**
   * Apply linear gradient between two RGB colors across string characters.
   */
  public static linearGradient(
    text: string,
    from: RGB = AnsiGradient.PALETTES.cyanBlue[0],
    to: RGB = AnsiGradient.PALETTES.cyanBlue[1]
  ): string {
    if (!text || text.length === 0) return "";
    if (text.length === 1) {
      return AnsiGradient.colorRgb(text, from);
    }

    let result = "";
    const len = text.length;

    for (let i = 0; i < len; i++) {
      const char = text[i];
      // Preserve existing newlines and control characters
      if (char === "\n" || char === "\r") {
        result += char;
        continue;
      }

      const t = i / (len - 1);
      const r = Math.round(from[0] + t * (to[0] - from[0]));
      const g = Math.round(from[1] + t * (to[1] - from[1]));
      const b = Math.round(from[2] + t * (to[2] - from[2]));

      result += `\x1b[38;2;${r};${g};${b}m${char}`;
    }

    result += "\x1b[0m";
    return result;
  }

  /**
   * Render a stylish horizontal progress bar with filled gradient and unfilled track.
   */
  public static horizontalBar(
    value: number,
    max: number,
    width: number = 20,
    palette: keyof typeof AnsiGradient.PALETTES = "cyanBlue"
  ): string {
    const safeMax = max <= 0 ? 1 : max;
    const ratio = Math.max(0, Math.min(1, value / safeMax));
    const filledCount = Math.round(ratio * width);
    const unfilledCount = Math.max(0, width - filledCount);

    const [from, to] = AnsiGradient.PALETTES[palette];
    let filledStr = "";

    for (let i = 0; i < filledCount; i++) {
      const t = filledCount > 1 ? i / (filledCount - 1) : 0;
      const r = Math.round(from[0] + t * (to[0] - from[0]));
      const g = Math.round(from[1] + t * (to[1] - from[1]));
      const b = Math.round(from[2] + t * (to[2] - from[2]));
      filledStr += `\x1b[38;2;${r};${g};${b}m█`;
    }

    const unfilledStr = `\x1b[38;2;60;60;70m${"░".repeat(unfilledCount)}\x1b[0m`;
    return `${filledStr}${unfilledStr}\x1b[0m`;
  }

  /**
   * Render a unicode sparkline string from a series of numeric values.
   */
  public static sparkline(
    values: number[],
    palette: keyof typeof AnsiGradient.PALETTES = "cyanBlue"
  ): string {
    if (!values || values.length === 0) return "";
    const glyphs = [" ", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min <= 0 ? 1 : max - min;

    const [from, to] = AnsiGradient.PALETTES[palette];
    let result = "";

    for (let i = 0; i < values.length; i++) {
      const val = values[i] ?? min;
      const norm = (val - min) / range;
      const glyphIndex = Math.min(glyphs.length - 1, Math.floor(norm * glyphs.length));
      const glyph = glyphs[glyphIndex];

      const t = values.length > 1 ? i / (values.length - 1) : 0;
      const r = Math.round(from[0] + t * (to[0] - from[0]));
      const g = Math.round(from[1] + t * (to[1] - from[1]));
      const b = Math.round(from[2] + t * (to[2] - from[2]));

      result += `\x1b[38;2;${r};${g};${b}m${glyph}`;
    }

    result += "\x1b[0m";
    return result;
  }
}
