import fs from "node:fs";
import path from "node:path";
import { UserConfigManager } from "../persistence/user-config-manager.js";

export type GraphicProtocol = "kitty" | "sixel" | "iterm2" | "halfblock";

export type RGB = [number, number, number];

export interface HeaderLogoOptions {
  protocol?: GraphicProtocol;
  logoPath?: string;
  width?: number;
}

export const ANTIGRAVITY_PALETTE = {
  darkOnyx: [10, 10, 12] as RGB, // #0A0A0C
  neonCyan: [0, 242, 254] as RGB, // #00F2FE
  electricBlue: [67, 97, 238] as RGB, // #4361EE
  neonViolet: [114, 9, 183] as RGB, // #7209B7
  magenta: [247, 37, 133] as RGB, // #F72585
  neonEmerald: [0, 242, 152] as RGB, // #00F298
  purpleGlow: [142, 45, 226] as RGB, // #8E2DE2
};

/**
 * Procedural 16x8 pixel matrix representing the Anantham infinite gateway / Möbius emblem.
 * Rendered using 24-bit TrueColor half-blocks (16x4 character grid).
 */
const DEFAULT_EMBLEM_MATRIX: RGB[][] = [
  // Row 0: Top loop arcs
  [
    ANTIGRAVITY_PALETTE.darkOnyx, ANTIGRAVITY_PALETTE.darkOnyx, ANTIGRAVITY_PALETTE.darkOnyx,
    ANTIGRAVITY_PALETTE.neonCyan, ANTIGRAVITY_PALETTE.neonCyan, ANTIGRAVITY_PALETTE.neonCyan,
    ANTIGRAVITY_PALETTE.darkOnyx, ANTIGRAVITY_PALETTE.darkOnyx, ANTIGRAVITY_PALETTE.darkOnyx,
    ANTIGRAVITY_PALETTE.darkOnyx, ANTIGRAVITY_PALETTE.magenta, ANTIGRAVITY_PALETTE.magenta,
    ANTIGRAVITY_PALETTE.magenta, ANTIGRAVITY_PALETTE.darkOnyx, ANTIGRAVITY_PALETTE.darkOnyx,
    ANTIGRAVITY_PALETTE.darkOnyx,
  ],
  // Row 1: Outer curves & initial crossover angle
  [
    ANTIGRAVITY_PALETTE.darkOnyx, ANTIGRAVITY_PALETTE.neonCyan, ANTIGRAVITY_PALETTE.neonCyan,
    ANTIGRAVITY_PALETTE.darkOnyx, ANTIGRAVITY_PALETTE.darkOnyx, ANTIGRAVITY_PALETTE.electricBlue,
    ANTIGRAVITY_PALETTE.electricBlue, ANTIGRAVITY_PALETTE.darkOnyx, ANTIGRAVITY_PALETTE.darkOnyx,
    ANTIGRAVITY_PALETTE.purpleGlow, ANTIGRAVITY_PALETTE.darkOnyx, ANTIGRAVITY_PALETTE.darkOnyx,
    ANTIGRAVITY_PALETTE.magenta, ANTIGRAVITY_PALETTE.magenta, ANTIGRAVITY_PALETTE.darkOnyx,
    ANTIGRAVITY_PALETTE.darkOnyx,
  ],
  // Row 2: Nexus center crossover
  [
    ANTIGRAVITY_PALETTE.neonCyan, ANTIGRAVITY_PALETTE.neonCyan, ANTIGRAVITY_PALETTE.darkOnyx,
    ANTIGRAVITY_PALETTE.darkOnyx, ANTIGRAVITY_PALETTE.electricBlue, ANTIGRAVITY_PALETTE.electricBlue,
    ANTIGRAVITY_PALETTE.neonViolet, ANTIGRAVITY_PALETTE.neonViolet, ANTIGRAVITY_PALETTE.purpleGlow,
    ANTIGRAVITY_PALETTE.purpleGlow, ANTIGRAVITY_PALETTE.darkOnyx, ANTIGRAVITY_PALETTE.darkOnyx,
    ANTIGRAVITY_PALETTE.magenta, ANTIGRAVITY_PALETTE.magenta, ANTIGRAVITY_PALETTE.darkOnyx,
    ANTIGRAVITY_PALETTE.darkOnyx,
  ],
  // Row 3: Mid waist nexus
  [
    ANTIGRAVITY_PALETTE.neonCyan, ANTIGRAVITY_PALETTE.neonCyan, ANTIGRAVITY_PALETTE.darkOnyx,
    ANTIGRAVITY_PALETTE.darkOnyx, ANTIGRAVITY_PALETTE.darkOnyx, ANTIGRAVITY_PALETTE.neonViolet,
    ANTIGRAVITY_PALETTE.neonViolet, ANTIGRAVITY_PALETTE.neonViolet, ANTIGRAVITY_PALETTE.neonViolet,
    ANTIGRAVITY_PALETTE.darkOnyx, ANTIGRAVITY_PALETTE.darkOnyx, ANTIGRAVITY_PALETTE.darkOnyx,
    ANTIGRAVITY_PALETTE.magenta, ANTIGRAVITY_PALETTE.magenta, ANTIGRAVITY_PALETTE.darkOnyx,
    ANTIGRAVITY_PALETTE.darkOnyx,
  ],
  // Row 4: Mid waist nexus reverse
  [
    ANTIGRAVITY_PALETTE.neonCyan, ANTIGRAVITY_PALETTE.neonCyan, ANTIGRAVITY_PALETTE.darkOnyx,
    ANTIGRAVITY_PALETTE.darkOnyx, ANTIGRAVITY_PALETTE.darkOnyx, ANTIGRAVITY_PALETTE.neonViolet,
    ANTIGRAVITY_PALETTE.neonViolet, ANTIGRAVITY_PALETTE.neonViolet, ANTIGRAVITY_PALETTE.neonViolet,
    ANTIGRAVITY_PALETTE.darkOnyx, ANTIGRAVITY_PALETTE.darkOnyx, ANTIGRAVITY_PALETTE.darkOnyx,
    ANTIGRAVITY_PALETTE.magenta, ANTIGRAVITY_PALETTE.magenta, ANTIGRAVITY_PALETTE.darkOnyx,
    ANTIGRAVITY_PALETTE.darkOnyx,
  ],
  // Row 5: Lower crossover
  [
    ANTIGRAVITY_PALETTE.neonCyan, ANTIGRAVITY_PALETTE.neonCyan, ANTIGRAVITY_PALETTE.darkOnyx,
    ANTIGRAVITY_PALETTE.darkOnyx, ANTIGRAVITY_PALETTE.electricBlue, ANTIGRAVITY_PALETTE.electricBlue,
    ANTIGRAVITY_PALETTE.neonViolet, ANTIGRAVITY_PALETTE.neonViolet, ANTIGRAVITY_PALETTE.purpleGlow,
    ANTIGRAVITY_PALETTE.purpleGlow, ANTIGRAVITY_PALETTE.darkOnyx, ANTIGRAVITY_PALETTE.darkOnyx,
    ANTIGRAVITY_PALETTE.magenta, ANTIGRAVITY_PALETTE.magenta, ANTIGRAVITY_PALETTE.darkOnyx,
    ANTIGRAVITY_PALETTE.darkOnyx,
  ],
  // Row 6: Lower curves
  [
    ANTIGRAVITY_PALETTE.darkOnyx, ANTIGRAVITY_PALETTE.neonCyan, ANTIGRAVITY_PALETTE.neonCyan,
    ANTIGRAVITY_PALETTE.darkOnyx, ANTIGRAVITY_PALETTE.darkOnyx, ANTIGRAVITY_PALETTE.electricBlue,
    ANTIGRAVITY_PALETTE.electricBlue, ANTIGRAVITY_PALETTE.darkOnyx, ANTIGRAVITY_PALETTE.darkOnyx,
    ANTIGRAVITY_PALETTE.purpleGlow, ANTIGRAVITY_PALETTE.darkOnyx, ANTIGRAVITY_PALETTE.darkOnyx,
    ANTIGRAVITY_PALETTE.magenta, ANTIGRAVITY_PALETTE.magenta, ANTIGRAVITY_PALETTE.darkOnyx,
    ANTIGRAVITY_PALETTE.darkOnyx,
  ],
  // Row 7: Bottom loop arcs
  [
    ANTIGRAVITY_PALETTE.darkOnyx, ANTIGRAVITY_PALETTE.darkOnyx, ANTIGRAVITY_PALETTE.darkOnyx,
    ANTIGRAVITY_PALETTE.neonCyan, ANTIGRAVITY_PALETTE.neonCyan, ANTIGRAVITY_PALETTE.neonCyan,
    ANTIGRAVITY_PALETTE.darkOnyx, ANTIGRAVITY_PALETTE.darkOnyx, ANTIGRAVITY_PALETTE.darkOnyx,
    ANTIGRAVITY_PALETTE.darkOnyx, ANTIGRAVITY_PALETTE.magenta, ANTIGRAVITY_PALETTE.magenta,
    ANTIGRAVITY_PALETTE.magenta, ANTIGRAVITY_PALETTE.darkOnyx, ANTIGRAVITY_PALETTE.darkOnyx,
    ANTIGRAVITY_PALETTE.darkOnyx,
  ],
];

/**
 * TerminalLogoRenderer provides high-performance terminal logo rendering
 * across Kitty, iTerm2, Sixel graphics protocols with graceful fallback
 * to 24-bit TrueColor ANSI half-blocks (\u2580).
 */
export class TerminalLogoRenderer {
  /**
   * Detects the graphical capability of the current terminal session.
   */
  public static detectProtocol(): GraphicProtocol {
    // 1. Kitty Graphics Protocol
    if (process.env.KITTY_WINDOW_ID || process.env.TERM?.includes("kitty")) {
      return "kitty";
    }

    // 2. iTerm2 Inline Images Protocol
    if (process.env.TERM_PROGRAM === "iTerm.app" || process.env.LC_TERMINAL === "iTerm2") {
      return "iterm2";
    }

    // 3. Sixel Protocol
    if (process.env.TERM?.includes("sixel") || process.env.COLORTERM === "sixel") {
      return "sixel";
    }

    // 4. Default fallback to 24-bit TrueColor half-blocks
    return "halfblock";
  }

  /**
   * Resolves the custom logo path based on authoritative precedence:
   * 1. cliPath
   * 2. process.env.ANANTHAM_LOGO_PATH
   * 3. UserConfigManager.getInstance().getLogoPath()
   * 4. ./assets/logo.png (if exists)
   * 5. null
   */
  public static resolveLogoPath(cliPath?: string): string | null {
    if (cliPath && typeof cliPath === "string" && cliPath.trim().length > 0) {
      return cliPath.trim();
    }

    if (process.env.ANANTHAM_LOGO_PATH && process.env.ANANTHAM_LOGO_PATH.trim().length > 0) {
      return process.env.ANANTHAM_LOGO_PATH.trim();
    }

    try {
      const configLogo = UserConfigManager.getInstance().getLogoPath();
      if (configLogo && configLogo.trim().length > 0) {
        return configLogo.trim();
      }
    } catch {
      // Ignore user config read errors
    }

    const defaultAssets = [
      path.resolve(process.cwd(), "assets", "logo.png"),
      path.join(process.cwd(), "assets", "logo.png"),
      "./assets/logo.png",
    ];

    for (const assetPath of defaultAssets) {
      try {
        if (fs.existsSync(assetPath)) {
          return assetPath;
        }
      } catch {
        // Continue fallback
      }
    }

    return null;
  }

  /**
   * Renders a 2D pixel matrix of RGB tuples into 24-bit TrueColor half-block lines.
   * Uses '\u2580' ('▀') where top pixel is foreground color and bottom pixel is background color.
   */
  public static renderMatrixToHalfBlocks(matrix: RGB[][]): string[] {
    const lines: string[] = [];
    const height = matrix.length;
    if (height === 0) return lines;

    const width = matrix[0]?.length ?? 0;

    for (let y = 0; y < height; y += 2) {
      const topRow = matrix[y] ?? [];
      const bottomRow = matrix[y + 1] ?? [];
      let line = "";

      for (let x = 0; x < width; x++) {
        const topPixel = topRow[x] ?? ANTIGRAVITY_PALETTE.darkOnyx;
        const bottomPixel = bottomRow[x] ?? ANTIGRAVITY_PALETTE.darkOnyx;

        const fg = `\x1b[38;2;${topPixel[0]};${topPixel[1]};${topPixel[2]}m`;
        const bg = `\x1b[48;2;${bottomPixel[0]};${bottomPixel[1]};${bottomPixel[2]}m`;
        line += `${fg}${bg}\u2580`;
      }

      line += "\x1b[0m";
      lines.push(line);
    }

    return lines;
  }

  /**
   * Renders procedural cybernetic Anantham infinite emblem in 24-bit TrueColor half-blocks.
   * If width is specified, formats or crops/pads the emblem to fit.
   */
  public static renderHalfBlockLogo(width?: number): string[] {
    let matrix = DEFAULT_EMBLEM_MATRIX;

    if (width && width > 0 && width !== 16) {
      if (width < 16) {
        // Symmetrically crop horizontal columns
        const startX = Math.max(0, Math.floor((16 - width) / 2));
        matrix = DEFAULT_EMBLEM_MATRIX.map((row) => row.slice(startX, startX + width));
      } else {
        // Pad with dark onyx
        const padLeft = Math.floor((width - 16) / 2);
        const padRight = width - 16 - padLeft;
        const leftPadding: RGB[] = Array.from({ length: padLeft }, () => ANTIGRAVITY_PALETTE.darkOnyx);
        const rightPadding: RGB[] = Array.from({ length: padRight }, () => ANTIGRAVITY_PALETTE.darkOnyx);

        matrix = DEFAULT_EMBLEM_MATRIX.map((row) => [...leftPadding, ...row, ...rightPadding]);
      }
    }

    return TerminalLogoRenderer.renderMatrixToHalfBlocks(matrix);
  }

  /**
   * Emits terminal graphics protocol escape sequences for Kitty, iTerm2, or Sixel.
   */
  public static renderGraphicProtocol(
    protocol: "kitty" | "iterm2" | "sixel",
    filePath: string
  ): string {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Logo file does not exist: ${filePath}`);
    }

    const buffer = fs.readFileSync(filePath);

    if (protocol === "kitty") {
      let w = 64;
      let h = 64;
      // Read PNG dimension headers if available (offset 16: width, offset 20: height)
      if (
        buffer.length >= 24 &&
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
      ) {
        w = buffer.readUInt32BE(16);
        h = buffer.readUInt32BE(20);
      }
      const base64 = buffer.toString("base64");
      return `\x1b_Ga=T,f=100,t=d,s=${w},v=${h};${base64}\x1b\\`;
    }

    if (protocol === "iterm2") {
      const base64 = buffer.toString("base64");
      return `\x1b]1337;File=inline=1;width=auto;height=auto:${base64}\x07`;
    }

    if (protocol === "sixel") {
      const rawString = buffer.toString("utf-8");
      if (rawString.startsWith("\x1bP") && rawString.includes("\x1b\\")) {
        return rawString;
      }
      // Emit valid Sixel DCS sequence representing the emblem
      const sixelColorDef =
        "#0;2;4;4;5#1;2;0;95;100#2;2;26;38;93#3;2;45;4;72#4;2;97;15;52";
      const sixelRaster = `"1;1;16;8`;
      const sixelData = "#1~?~?#2??~~#3~~??#4~?~?";
      return `\x1bPq${sixelRaster}${sixelColorDef}${sixelData}\x1b\\`;
    }

    throw new Error(`Unsupported graphic protocol: ${protocol}`);
  }

  /**
   * Orchestrates logo rendering across graphics protocols and TrueColor half-blocks.
   * Supports both overload styles:
   * - renderHeaderLogo(protocol?: GraphicProtocol, cliPath?: string)
   * - renderHeaderLogo(options?: HeaderLogoOptions)
   */
  public static renderHeaderLogo(
    optionsOrProtocol?: GraphicProtocol | HeaderLogoOptions,
    cliPath?: string
  ): string[] {
    let protocol: GraphicProtocol | undefined;
    let logoPath: string | undefined;
    let width: number | undefined;

    if (typeof optionsOrProtocol === "string") {
      protocol = optionsOrProtocol;
      logoPath = cliPath;
    } else if (optionsOrProtocol && typeof optionsOrProtocol === "object") {
      protocol = optionsOrProtocol.protocol;
      logoPath = optionsOrProtocol.logoPath;
      width = optionsOrProtocol.width;
    } else {
      logoPath = cliPath;
    }

    const effectiveProtocol = protocol ?? TerminalLogoRenderer.detectProtocol();
    const resolvedPath = TerminalLogoRenderer.resolveLogoPath(logoPath);

    if (
      effectiveProtocol !== "halfblock" &&
      resolvedPath &&
      fs.existsSync(resolvedPath)
    ) {
      try {
        const graphicSequence = TerminalLogoRenderer.renderGraphicProtocol(
          effectiveProtocol,
          resolvedPath
        );
        return [graphicSequence];
      } catch {
        return TerminalLogoRenderer.renderHalfBlockLogo(width);
      }
    }

    return TerminalLogoRenderer.renderHalfBlockLogo(width);
  }

  // Instance method delegates
  public detectProtocol(): GraphicProtocol {
    return TerminalLogoRenderer.detectProtocol();
  }

  public resolveLogoPath(cliPath?: string): string | null {
    return TerminalLogoRenderer.resolveLogoPath(cliPath);
  }

  public renderHalfBlockLogo(width?: number): string[] {
    return TerminalLogoRenderer.renderHalfBlockLogo(width);
  }

  public renderGraphicProtocol(
    protocol: "kitty" | "iterm2" | "sixel",
    filePath: string
  ): string {
    return TerminalLogoRenderer.renderGraphicProtocol(protocol, filePath);
  }

  public renderHeaderLogo(
    optionsOrProtocol?: GraphicProtocol | HeaderLogoOptions,
    cliPath?: string
  ): string[] {
    return TerminalLogoRenderer.renderHeaderLogo(optionsOrProtocol, cliPath);
  }
}
