/**
 * Unified Terminal Formatting, Themes & Rendering Engine
 * PRD-CLI-007: Unified Output Formatting, Themes & Rendering
 */

export type TerminalTheme = "dark" | "light" | "high_contrast" | "plain";

export interface ColorScheme {
  success: string;
  error: string;
  warning: string;
  info: string;
  diffAdd: string;
  diffRemove: string;
  dim: string;
  bold: string;
  reset: string;
}

export class TerminalThemeRenderer {
  private currentTheme: TerminalTheme;

  private static readonly SCHEMES: Record<TerminalTheme, ColorScheme> = {
    dark: {
      success: "\x1b[32m",
      error: "\x1b[31m",
      warning: "\x1b[33m",
      info: "\x1b[36m",
      diffAdd: "\x1b[32m",
      diffRemove: "\x1b[31m",
      dim: "\x1b[2m",
      bold: "\x1b[1m",
      reset: "\x1b[0m",
    },
    light: {
      success: "\x1b[32m",
      error: "\x1b[31m",
      warning: "\x1b[33m",
      info: "\x1b[34m",
      diffAdd: "\x1b[32m",
      diffRemove: "\x1b[31m",
      dim: "\x1b[2m",
      bold: "\x1b[1m",
      reset: "\x1b[0m",
    },
    high_contrast: {
      success: "\x1b[92;1m",
      error: "\x1b[91;1m",
      warning: "\x1b[93;1m",
      info: "\x1b[97;1m",
      diffAdd: "\x1b[92;1m",
      diffRemove: "\x1b[91;1m",
      dim: "\x1b[37m",
      bold: "\x1b[1m",
      reset: "\x1b[0m",
    },
    plain: {
      success: "",
      error: "",
      warning: "",
      info: "",
      diffAdd: "",
      diffRemove: "",
      dim: "",
      bold: "",
      reset: "",
    },
  };

  constructor(theme: TerminalTheme = "dark") {
    this.currentTheme = theme;
  }

  public setTheme(theme: TerminalTheme): void {
    this.currentTheme = theme;
  }

  public getTheme(): TerminalTheme {
    return this.currentTheme;
  }

  public formatDiff(diffText: string): string {
    const s = TerminalThemeRenderer.SCHEMES[this.currentTheme];
    const lines = diffText.split(/\r?\n/);

    const formatted = lines.map((line) => {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        return `${s.diffAdd}${line}${s.reset}`;
      }
      if (line.startsWith("-") && !line.startsWith("---")) {
        return `${s.diffRemove}${line}${s.reset}`;
      }
      if (line.startsWith("@@")) {
        return `${s.info}${line}${s.reset}`;
      }
      return line;
    });

    return formatted.join("\n");
  }

  public formatMessage(level: "success" | "error" | "warning" | "info", text: string): string {
    const s = TerminalThemeRenderer.SCHEMES[this.currentTheme];
    const prefix = level === "success" ? "✓" : level === "error" ? "✗" : level === "warning" ? "⚠" : "ℹ";
    return `${s[level]}${s.bold}${prefix} ${text}${s.reset}`;
  }

  public renderMarkdownSnippet(md: string): string {
    const s = TerminalThemeRenderer.SCHEMES[this.currentTheme];
    return md
      .replace(/^#\s+(.+)$/gm, `${s.bold}${s.info}=== $1 ===${s.reset}`)
      .replace(/^##\s+(.+)$/gm, `${s.bold}--- $1 ---${s.reset}`)
      .replace(/\*\*([^*]+)\*\*/g, `${s.bold}$1${s.reset}`)
      .replace(/`([^`]+)`/g, `${s.warning}$1${s.reset}`);
  }
}
