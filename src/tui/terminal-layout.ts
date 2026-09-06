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

export interface AntigravityHeaderOptions {
  status?: string;
  projectId?: string;
  sessionId?: string;
  dimensions?: TuiDimensions;
  width?: number;
  activeModel?: string;
  gateway?: string;
  logoPath?: string;
  brandColor?: string;
}

export interface PromptBarOptions {
  width: number;
  commandPrompt?: string;
  isCommandMode?: boolean;
  cursorPosition?: number;
  bottomRule?: boolean;
  ruleChar?: string;
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
   * Render Antigravity Header with coiled infinity serpent branding, dock layout, and status pill.
   */
  public static renderAntigravityHeader(options: AntigravityHeaderOptions): string[];
  public static renderAntigravityHeader(
    status: string,
    projectId?: string,
    sessionId?: string,
    dimensions?: TuiDimensions,
    activeModel?: string
  ): string[];
  public static renderAntigravityHeader(
    statusOrOptions?: string | AntigravityHeaderOptions,
    projectId?: string,
    sessionId?: string,
    dimensions?: TuiDimensions,
    activeModel?: string
  ): string[] {
    let status = "ONLINE";
    let projId = projectId;
    let sessId = sessionId;
    let dims: TuiDimensions = dimensions ?? { width: 80, height: 24 };
    let model = activeModel;
    let gateway = "OpenRouter";
    let brandColor = "\x1b[38;2;0;242;152m";

    if (typeof statusOrOptions === "object" && statusOrOptions !== null) {
      status = statusOrOptions.status ?? "ONLINE";
      projId = statusOrOptions.projectId;
      sessId = statusOrOptions.sessionId;
      const w = statusOrOptions.width ?? statusOrOptions.dimensions?.width ?? 80;
      const h = statusOrOptions.dimensions?.height ?? 24;
      dims = statusOrOptions.dimensions ?? { width: w, height: h };
      model = statusOrOptions.activeModel;
      gateway = statusOrOptions.gateway ?? "OpenRouter";
      if (statusOrOptions.brandColor) {
        brandColor = statusOrOptions.brandColor;
      }
    } else if (typeof statusOrOptions === "string") {
      status = statusOrOptions;
      if (dimensions) {
        dims = dimensions;
      }
    }

    const width = dims.width;

    if (width < 80) {
      return [TerminalLayout.renderStatusBar(status, projId, sessId, dims)];
    }

    const lines: string[] = [];

    const serpentTop = `${brandColor}╭─━∞━─╮\x1b[0m`;
    const serpentBottom = `${brandColor}╰─━∞━─╯\x1b[0m`;

    const title = AnsiGradient.linearGradient(
      "ANANTHAM INFINITE TUI",
      AnsiGradient.PALETTES.cyanBlue[0],
      AnsiGradient.PALETTES.cyanBlue[1]
    );

    const statusPill = "\x1b[48;2;16;38;56m\x1b[38;2;0;242;254m[HARNESS: ONLINE | LATENCY: 18ms]\x1b[0m";
    const shellSubtitle = "\x1b[90mAntigravity Reactive Shell\x1b[0m";

    // --- Line 1 Construction ---
    if (width >= 90) {
      const left1 = ` ${serpentTop} ${title} ${statusPill}`;
      const visLeft1 = TuiSanitizer.stripAnsi(left1).length;
      const remainingForShell = width - visLeft1;
      let right1 = "";
      if (remainingForShell >= 26) {
        const pad1 = remainingForShell - 26;
        right1 = `${" ".repeat(pad1)}${shellSubtitle}`;
      } else {
        const pad1 = Math.max(1, remainingForShell - 16);
        right1 = `${" ".repeat(pad1)}Status: [${status}]`;
      }
      const line1 = `${left1}${right1}`;
      lines.push(TuiSanitizer.stripAnsi(line1).length <= width ? line1 : TuiSanitizer.truncate(line1, width));
    } else {
      const left1 = ` ${serpentTop}  ${title}`;
      const visLeft1 = TuiSanitizer.stripAnsi(left1).length;
      const statusText = `Status: [${status}] `;
      const visStatus = TuiSanitizer.stripAnsi(statusText).length;
      let right1 = statusText;
      if (projId) {
        const availForProj = Math.max(0, width - visLeft1 - visStatus - 13);
        const displayProj = availForProj > 3
          ? (projId.length > availForProj ? projId.slice(0, availForProj - 3) + "..." : projId)
          : projId.slice(0, availForProj);
        if (displayProj.length > 0) {
          right1 = `Project: ${displayProj} │ ${statusText}`;
        }
      }
      const visRight1 = TuiSanitizer.stripAnsi(right1).length;
      const space1 = Math.max(1, width - visLeft1 - visRight1);
      const line1 = `${left1}${" ".repeat(space1)}${right1}`;
      lines.push(TuiSanitizer.stripAnsi(line1).length <= width ? line1 : TuiSanitizer.truncate(line1, width));
    }

    // --- Line 2 Construction ---
    let displayModel = "auto";
    if (model && model.trim().length > 0 && model.trim() !== "auto") {
      const clean = model.trim();
      displayModel = clean.includes("/") ? (clean.split("/").pop() ?? clean) : clean;
    }

    const logoTag = "\x1b[38;2;0;242;254m[LOGO]\x1b[0m";
    const harnessText = "\x1b[1;37mANTIGRAVITY HARNESS\x1b[0m";
    const sep = "\x1b[90m│\x1b[0m";
    const gwText = `\x1b[38;2;0;242;152mGATEWAY:\x1b[0m ${gateway}`;
    const modelLabel = "\x1b[38;2;79;172;254mMODEL:\x1b[0m";

    const dockPrefix = ` ${serpentBottom} ${logoTag} ${harnessText} ${sep} ${gwText} ${sep} ${modelLabel} `;
    const visDockPrefix = TuiSanitizer.stripAnsi(dockPrefix).length;

    let right2 = "";
    if (width >= 120) {
      right2 = `Project: ${projId ?? "(none)"} │ Status: [${status}] │ ${dims.width}x${dims.height} `;
    } else if (width >= 90 && displayModel.length <= 8) {
      right2 = projId ? `Project: ${projId} ` : `Status: [${status}] `;
    }
    const visRight2 = TuiSanitizer.stripAnsi(right2).length;

    const maxModelLen = Math.max(4, width - visDockPrefix - visRight2 - 1);
    let finalModel = displayModel;
    if (finalModel.length > maxModelLen) {
      finalModel = maxModelLen > 6 ? finalModel.slice(0, maxModelLen - 3) + "..." : finalModel.slice(0, maxModelLen);
    }
    const modelStyled = `\x1b[38;2;79;172;254m${finalModel}\x1b[0m`;

    const left2 = `${dockPrefix}${modelStyled}`;
    const visLeft2 = TuiSanitizer.stripAnsi(left2).length;
    const space2 = Math.max(1, width - visLeft2 - visRight2);
    let line2 = `${left2}${" ".repeat(space2)}${right2}`;
    if (TuiSanitizer.stripAnsi(line2).length > width) {
      const excess = TuiSanitizer.stripAnsi(line2).length - width;
      if (space2 > excess) {
        line2 = `${left2}${" ".repeat(space2 - excess)}${right2}`;
      } else {
        line2 = `${left2}`;
      }
    }
    lines.push(TuiSanitizer.stripAnsi(line2).length <= width ? line2 : TuiSanitizer.truncate(line2, width));

    return lines;
  }

  /**
   * Render horizontal divider.
   */
  public static renderDivider(width: number, char = "─"): string {
    return char.repeat(Math.max(0, width));
  }

  /**
   * Helper to resolve command prompt prefix and suffix decorations and their visible lengths.
   * Shared between renderPromptBar and getPromptCursorCol to guarantee zero layout drift.
   */
  public static getPromptDecorations(
    width: number,
    commandPrompt: string
  ): {
    prefix: string;
    suffix: string;
    visPrefixLen: number;
    visSuffixLen: number;
    isUltraNarrow: boolean;
    isNarrow: boolean;
    isSlash: boolean;
  } {
    const isSlash = commandPrompt.startsWith("/");
    const isUltraNarrow = width < 25;
    const isNarrow = !isUltraNarrow && (isSlash ? width < 70 : width < 50);

    let prefix: string;
    let suffix: string;

    if (isUltraNarrow) {
      prefix = " : ";
      suffix = "_";
    } else if (isNarrow) {
      prefix = " [CMD] : ";
      suffix = "_ | [↵] [ESC]";
    } else if (isSlash) {
      prefix = " \x1b[38;2;0;242;254m❖ anantham:preview >\x1b[0m ";
      suffix = "_ \x1b[90m| [ENTER] Run, [TAB] Complete, [ESC] Close\x1b[0m";
    } else {
      prefix = " [COMMAND MODE] : ";
      suffix = "_ | [ENTER] Run, [ESC] Cancel";
    }

    const visPrefixLen = TuiSanitizer.stripAnsi(prefix).length;
    const visSuffixLen = TuiSanitizer.stripAnsi(suffix).length;
    return { prefix, suffix, visPrefixLen, visSuffixLen, isUltraNarrow, isNarrow, isSlash };
  }

  /**
   * Render Antigravity Prompt Bar framed by divider rule lines.
   * Preserves exact row indexing and bottom-line indexing for terminal stability.
   */
  public static renderPromptBar(options: PromptBarOptions): string[] {
    const { width, commandPrompt = "", isCommandMode = false, bottomRule = false, ruleChar = "─" } = options;
    const lines: string[] = [];

    // Upper framing rule line
    lines.push(TerminalLayout.renderDivider(width, ruleChar));

    // Prompt line layout
    const inCommandMode = isCommandMode || commandPrompt.length > 0;
    let rawLine = "";

    if (inCommandMode) {
      const { prefix, suffix, visPrefixLen, visSuffixLen } = TerminalLayout.getPromptDecorations(width, commandPrompt);
      const avail = Math.max(0, width - visPrefixLen - visSuffixLen);
      const cleanPrompt = TuiSanitizer.sanitize(commandPrompt);

      let visiblePrompt = "";
      if (avail > 0) {
        if (cleanPrompt.length <= avail) {
          visiblePrompt = cleanPrompt;
        } else if (avail > 3) {
          visiblePrompt = "..." + cleanPrompt.slice(-(avail - 3));
        } else {
          visiblePrompt = cleanPrompt.slice(-avail);
        }
      }

      rawLine = `${prefix}${visiblePrompt}${suffix}`;
    } else {
      if (width >= 92) {
        const leftPrompt = " \x1b[38;2;0;242;254m❯\x1b[0m \x1b[90mask anything or type / for commands...\x1b[0m";
        const rightMode = "\x1b[38;2;0;242;254m❖\x1b[0m [NORMAL MODE] [1-9] Views, [:] Command, [q] Quit";
        const visLeft = TuiSanitizer.stripAnsi(leftPrompt).length;
        const visRight = TuiSanitizer.stripAnsi(rightMode).length;
        const gap = Math.max(1, width - visLeft - visRight);
        rawLine = `${leftPrompt}${" ".repeat(gap)}${rightMode}`;
      } else if (width >= 80) {
        const leftPrompt = " \x1b[38;2;0;242;254m❯\x1b[0m \x1b[90m/ for commands\x1b[0m";
        const rightMode = "\x1b[38;2;0;242;254m❖\x1b[0m [NORMAL MODE] [1-9] Views, [:] Command, [q] Quit";
        const visLeft = TuiSanitizer.stripAnsi(leftPrompt).length;
        const visRight = TuiSanitizer.stripAnsi(rightMode).length;
        const gap = Math.max(1, width - visLeft - visRight);
        rawLine = `${leftPrompt}${" ".repeat(gap)}${rightMode}`;
      } else if (width >= 53) {
        rawLine = " \x1b[38;2;0;242;254m❖\x1b[0m [NORMAL MODE] [1-9] Views, [:] Command, [q] Quit";
      } else if (width >= 49) {
        rawLine = " [NORMAL MODE] [1-9] Views, [:] Command, [q] Quit";
      } else if (width >= 32) {
        rawLine = " [NORMAL] [:] Cmd, [q] Quit";
      } else {
        rawLine = TuiSanitizer.truncate(" [NORM] [:] [q]", width);
      }
    }

    // Mandatory line-level width clamping
    const clampedLine = TuiSanitizer.stripAnsi(rawLine).length <= width
      ? rawLine
      : TuiSanitizer.truncate(rawLine, width);
    lines.push(clampedLine);

    // Optional bottom framing rule line (only when explicitly requested)
    if (bottomRule) {
      lines.push(TerminalLayout.renderDivider(width, ruleChar));
    }

    return lines;
  }

  /**
   * Frame prompt text with an upper divider rule, preserving prompt as the final line.
   */
  public static framePromptLine(promptText: string, width: number, char = "─"): string[] {
    return [
      TerminalLayout.renderDivider(width, char),
      promptText,
    ];
  }

  /**
   * Helper to calculate the exact 1-based terminal row index for the prompt line.
   * Guarantees cursor positioning does not point to a bottom divider rule.
   */
  public static getPromptRowIndex(totalLines: number, hasBottomRule = false): number {
    return hasBottomRule ? Math.max(1, totalLines - 1) : Math.max(1, totalLines);
  }

  /**
   * Helper to calculate the exact 1-based terminal column index for the cursor.
   * Strips ANSI sequences from prefix and suffix to prevent ANSI offset drift.
   * Strictly tracks visible display characters, accounts for horizontal ellipsis scrolling,
   * and clamps coordinates to [1, width].
   */
  public static getPromptCursorCol(
    width: number,
    commandPrompt: string,
    cursorPosition: number,
    isCommandMode: boolean
  ): number {
    if (!isCommandMode) return 1;

    const { visPrefixLen, visSuffixLen } = TerminalLayout.getPromptDecorations(width, commandPrompt);
    const avail = Math.max(0, width - visPrefixLen - visSuffixLen);

    const clean = TuiSanitizer.sanitize(commandPrompt);
    const cur = Math.max(0, Math.min(cursorPosition, clean.length));

    let visCursorPos = 0;
    if (avail === 0) {
      visCursorPos = 0;
    } else if (clean.length <= avail) {
      visCursorPos = cur;
    } else if (avail > 3) {
      const sliceStart = clean.length - (avail - 3);
      visCursorPos = Math.max(0, Math.min(3 + (cur - sliceStart), avail));
    } else {
      const sliceStart = clean.length - avail;
      visCursorPos = Math.max(0, Math.min(cur - sliceStart, avail));
    }

    const rawCol = visPrefixLen + visCursorPos + 1;
    return Math.max(1, Math.min(rawCol, width));
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
