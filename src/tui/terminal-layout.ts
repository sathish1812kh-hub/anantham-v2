import { TuiSanitizer } from "./tui-sanitizer.js";
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
    const left = ` ❖ Anantham V2 | Project: ${projectId ?? "(none)"} | Session: ${sessionId ?? "(none)"}`;
    const right = `Status: [${status}] | ${dimensions.width}x${dimensions.height} `;
    const space = Math.max(2, dimensions.width - left.length - right.length);

    return `${left}${" ".repeat(space)}${right}`;
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
