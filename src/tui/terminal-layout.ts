import { TuiSanitizer } from "./tui-sanitizer.js";
import { AnsiGradient } from "./ansi-gradient.js";
import { type TuiDimensions, type TuiViewMode } from "../domain/tui.js";

export interface BoxOptions {
  title?: string;
  width?: number;
  height?: number;
  borderStyle?: "single" | "double" | "rounded";
}

export interface TabItem {
  key: string;
  label: string;
  mode: TuiViewMode;
  active: boolean;
}

/**
 * ANSI Terminal Layout & Box Drawing Engine.
 * PRD Part 2 Section 186.
 */
export class TerminalLayout {
  public static readonly BORDERS = {
    single: {
      tl: "┌",
      tr: "┐",
      bl: "└",
      br: "┘",
      h: "─",
      v: "│",
      tm: "┬",
      bm: "┴",
      lm: "├",
      rm: "┤",
      x: "┼",
    },
    double: {
      tl: "╔",
      tr: "╗",
      bl: "╚",
      br: "╝",
      h: "═",
      v: "║",
      tm: "╦",
      bm: "╩",
      lm: "╠",
      rm: "╣",
      x: "╬",
    },
    rounded: {
      tl: "╭",
      tr: "╮",
      bl: "╰",
      br: "╯",
      h: "─",
      v: "│",
      tm: "┬",
      bm: "┴",
      lm: "├",
      rm: "┤",
      x: "┼",
    },
  };

  /**
   * Draw a box around lines of content.
   */
  public static drawBox(lines: string[], options: BoxOptions = {}): string[] {
    const style = this.BORDERS[options.borderStyle ?? "single"];
    const contentWidth = Math.max(
      ...lines.map((l) => TuiSanitizer.sanitize(l).length),
      options.title ? TuiSanitizer.sanitize(options.title).length + 4 : 0,
      options.width ? options.width - 2 : 20
    );

    const targetWidth = options.width ? Math.max(options.width - 2, contentWidth) : contentWidth;

    const result: string[] = [];

    // Header line
    if (options.title) {
      const cleanTitle = ` ${TuiSanitizer.sanitize(options.title)} `;
      const remainingH = Math.max(0, targetWidth - cleanTitle.length);
      result.push(`${style.tl}${cleanTitle}${style.h.repeat(remainingH)}${style.tr}`);
    } else {
      result.push(`${style.tl}${style.h.repeat(targetWidth)}${style.tr}`);
    }

    // Body lines
    for (const rawLine of lines) {
      const clean = TuiSanitizer.sanitize(rawLine);
      const padded = TuiSanitizer.pad(clean, targetWidth);
      result.push(`${style.v}${padded}${style.v}`);
    }

    // Height padding if requested
    if (options.height && result.length < options.height - 1) {
      const needed = options.height - 1 - result.length;
      for (let i = 0; i < needed; i++) {
        result.push(`${style.v}${" ".repeat(targetWidth)}${style.v}`);
      }
    }

    // Bottom line
    result.push(`${style.bl}${style.h.repeat(targetWidth)}${style.br}`);

    return result;
  }

  /**
   * Render horizontal navigation tab bar.
   */
  public static renderTabBar(tabs: TabItem[], width: number): string {
    const renderedTabs = tabs.map((tab) => {
      const text = `[${tab.key}] ${tab.label}`;
      return tab.active ? `\x1b[1;36m▶ ${text} ◀\x1b[0m` : `  ${text}  `;
    });

    const joined = renderedTabs.join("│");
    const rawLen = tabs.reduce((acc, tab) => acc + tab.key.length + tab.label.length + 8, 0);
    const padding = Math.max(0, width - rawLen);

    return ` ${joined}${" ".repeat(padding)}`;
  }

  /**
   * Render top status bar.
   */
  public static renderStatusBar(
    status: string,
    projectId: string | undefined,
    sessionId: string | undefined,
    dimensions: TuiDimensions
  ): string {
    const width = dimensions.width;
    const left = width >= 70
      ? ` ❖ Anantham V2 | Project: ${projectId ?? "(none)"} | Session: ${sessionId ?? "(none)"}`
      : width >= 45
        ? ` ❖ Anantham | ${projectId ?? "(none)"}`
        : " ❖ Anantham";
    const right = width >= 60
      ? `Status: [${status}] | ${dimensions.width}x${dimensions.height} `
      : `[${status}] `;
    const space = Math.max(1, width - left.length - right.length);
    const combined = `${left}${" ".repeat(space)}${right}`;
    return combined.length <= width ? combined : combined.slice(0, width);
  }

  /**
   * Render Antigravity Header with coiled infinity serpent branding & status pill.
   */
  public static renderAntigravityHeader(
    status: string,
    projectId: string | undefined,
    sessionId: string | undefined,
    dimensions: TuiDimensions,
    activeModel?: string
  ): string[] {
    const width = dimensions.width;
    const lines: string[] = [];

    const serpentTop = "\x1b[38;2;0;242;152m╭─━∞━─╮\x1b[0m";
    const serpentBottom = "\x1b[38;2;0;242;152m╰─━∞━─╯\x1b[0m";

    const title = AnsiGradient.linearGradient(
      "ANANTHAM INFINITE TUI",
      AnsiGradient.PALETTES.cyanBlue[0],
      AnsiGradient.PALETTES.cyanBlue[1]
    );

    const statusPill = "\x1b[48;2;16;38;56m\x1b[38;2;0;242;254m[HARNESS: ONLINE | LATENCY: 18ms]\x1b[0m";
    const statusText = `Status: [${status}]`;

    if (width >= 80) {
      const left1 = ` ${serpentTop}  ${title} ❖  ${statusPill}`;
      const right1 = `${statusText} │ ${dimensions.width}x${dimensions.height} `;
      const space1 = Math.max(1, width - 68 - right1.length);
      lines.push(`${left1}${" ".repeat(space1)}${right1}`);

      const subtitle = "\x1b[90mAntigravity Reactive Shell v2.0.4\x1b[0m";
      const modelClean = activeModel ? activeModel.split("/").pop() : undefined;
      const modelStr = modelClean ? `\x1b[38;2;79;172;254mModel: ${modelClean}\x1b[0m` : "";
      const projSess = `Project: ${projectId ?? "(none)"} │ Session: ${sessionId ?? "(none)"} `;
      const left2 = ` ${serpentBottom}  ${subtitle}${modelStr ? " │ " + modelStr : ""}`;
      const space2 = Math.max(1, width - 42 - (modelClean ? modelClean.length + 9 : 0) - projSess.length);
      lines.push(`${left2}${" ".repeat(space2)}${projSess}`);
    } else {
      lines.push(TerminalLayout.renderStatusBar(status, projectId, sessionId, dimensions));
    }

    return lines;
  }

  /**
   * Render horizontal divider.
   */
  public static renderDivider(width: number, char = "─"): string {
    return char.repeat(Math.max(10, width));
  }

  /**
   * Render formatted 2-column table with aligned headers.
   */
  public static renderTable(headers: string[], rows: string[][], colWidths: number[]): string[] {
    const lines: string[] = [];

    // Header
    const headerRow = headers.map((h, i) => TuiSanitizer.pad(h, colWidths[i] ?? 15)).join(" │ ");
    lines.push(headerRow);
    lines.push(colWidths.map((w) => "─".repeat(w)).join("─┼─"));

    // Rows
    for (const row of rows) {
      const rowLine = row.map((cell, i) => TuiSanitizer.pad(cell, colWidths[i] ?? 15)).join(" │ ");
      lines.push(rowLine);
    }

    return lines;
  }
}
