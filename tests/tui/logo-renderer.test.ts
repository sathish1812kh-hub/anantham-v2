import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  TerminalLogoRenderer,
  ANTIGRAVITY_PALETTE,
} from "../../src/tui/terminal-logo-renderer.js";
import { UserConfigManager } from "../../src/persistence/user-config-manager.js";

describe("TerminalLogoRenderer", () => {
  const originalEnv = { ...process.env };
  let testOutputDir: string;

  beforeEach(() => {
    testOutputDir = path.join(os.tmpdir(), `anantham-logo-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(testOutputDir, { recursive: true });

    // Clean test environment variables
    delete process.env.KITTY_WINDOW_ID;
    delete process.env.TERM_PROGRAM;
    delete process.env.LC_TERMINAL;
    delete process.env.COLORTERM;
    delete process.env.ANANTHAM_LOGO_PATH;
    process.env.TERM = "xterm-256color";
  });

  afterEach(() => {
    // Restore environment
    process.env = { ...originalEnv };
    try {
      if (fs.existsSync(testOutputDir)) {
        fs.rmSync(testOutputDir, { recursive: true, force: true });
      }
    } catch {}
  });

  describe("detectProtocol", () => {
    it("detects Kitty protocol via KITTY_WINDOW_ID", () => {
      process.env.KITTY_WINDOW_ID = "1";
      expect(TerminalLogoRenderer.detectProtocol()).toBe("kitty");
    });

    it("detects Kitty protocol via TERM containing kitty", () => {
      process.env.TERM = "xterm-kitty";
      expect(TerminalLogoRenderer.detectProtocol()).toBe("kitty");
    });

    it("detects iTerm2 protocol via TERM_PROGRAM", () => {
      process.env.TERM_PROGRAM = "iTerm.app";
      expect(TerminalLogoRenderer.detectProtocol()).toBe("iterm2");
    });

    it("detects iTerm2 protocol via LC_TERMINAL", () => {
      process.env.LC_TERMINAL = "iTerm2";
      expect(TerminalLogoRenderer.detectProtocol()).toBe("iterm2");
    });

    it("detects Sixel protocol via TERM containing sixel", () => {
      process.env.TERM = "vt340-sixel";
      expect(TerminalLogoRenderer.detectProtocol()).toBe("sixel");
    });

    it("detects Sixel protocol via COLORTERM=sixel", () => {
      process.env.COLORTERM = "sixel";
      expect(TerminalLogoRenderer.detectProtocol()).toBe("sixel");
    });

    it("falls back to halfblock when no graphics protocol is active", () => {
      process.env.TERM = "xterm-256color";
      expect(TerminalLogoRenderer.detectProtocol()).toBe("halfblock");
    });

    it("works via instance method delegate", () => {
      const renderer = new TerminalLogoRenderer();
      expect(renderer.detectProtocol()).toBe("halfblock");
    });
  });

  describe("resolveLogoPath", () => {
    it("prioritizes cliPath over env, config, and asset fallbacks", () => {
      process.env.ANANTHAM_LOGO_PATH = "/env/logo.png";
      const configMgr = UserConfigManager.getInstance(testOutputDir);
      configMgr.setLogoPath("/config/logo.png");

      const resolved = TerminalLogoRenderer.resolveLogoPath("/cli/custom.png");
      expect(resolved).toBe("/cli/custom.png");
    });

    it("prioritizes ANANTHAM_LOGO_PATH over config and asset fallbacks", () => {
      process.env.ANANTHAM_LOGO_PATH = "/env/logo.png";
      const configMgr = UserConfigManager.getInstance(testOutputDir);
      configMgr.setLogoPath("/config/logo.png");

      const resolved = TerminalLogoRenderer.resolveLogoPath();
      expect(resolved).toBe("/env/logo.png");
    });

    it("prioritizes UserConfigManager logoPath when CLI and env are absent", () => {
      const configMgr = UserConfigManager.getInstance(testOutputDir);
      configMgr.setLogoPath("/config/logo.png");

      const resolved = TerminalLogoRenderer.resolveLogoPath();
      expect(resolved).toBe("/config/logo.png");
    });

    it("returns null when no logo is configured and default asset does not exist", () => {
      const configMgr = UserConfigManager.getInstance(testOutputDir);
      configMgr.setLogoPath("");

      const resolved = TerminalLogoRenderer.resolveLogoPath();
      expect(resolved).toBeNull();
    });

    it("trims whitespace from input paths", () => {
      expect(TerminalLogoRenderer.resolveLogoPath("  /path/logo.png  ")).toBe("/path/logo.png");
    });

    it("works via instance method delegate", () => {
      const renderer = new TerminalLogoRenderer();
      expect(renderer.resolveLogoPath("/custom/logo.png")).toBe("/custom/logo.png");
    });
  });

  describe("UserConfigManager logoPath persistence", () => {
    it("stores and retrieves logoPath persistently", () => {
      const configMgr = UserConfigManager.getInstance(testOutputDir);
      expect(configMgr.getLogoPath()).toBeUndefined();

      configMgr.setLogoPath("/workspace/branding.png");
      expect(configMgr.getLogoPath()).toBe("/workspace/branding.png");

      // Verify reloaded from disk
      const reloadedMgr = new UserConfigManager(testOutputDir);
      expect(reloadedMgr.getLogoPath()).toBe("/workspace/branding.png");

      // Clear logo path
      configMgr.setLogoPath("");
      expect(configMgr.getLogoPath()).toBeUndefined();
    });
  });

  describe("renderHalfBlockLogo & 24-bit TrueColor", () => {
    it("renders 4 lines for 8-pixel high matrix", () => {
      const lines = TerminalLogoRenderer.renderHalfBlockLogo();
      expect(lines).toHaveLength(4);
      for (const line of lines) {
        expect(line.length).toBeGreaterThan(0);
        expect(line).toContain("\u2580");
        expect(line).toContain("\x1b[0m");
      }
    });

    it("encodes top pixel as foreground and bottom pixel as background TrueColor", () => {
      const customMatrix: Array<Array<[number, number, number]>> = [
        [[0, 242, 254]], // Top: Neon Cyan
        [[247, 37, 133]], // Bottom: Magenta
      ];
      const lines = TerminalLogoRenderer.renderMatrixToHalfBlocks(customMatrix);
      expect(lines).toHaveLength(1);
      // Top foreground: \x1b[38;2;0;242;254m
      expect(lines[0]).toContain("\x1b[38;2;0;242;254m");
      // Bottom background: \x1b[48;2;247;37;133m
      expect(lines[0]).toContain("\x1b[48;2;247;37;133m");
      expect(lines[0]).toContain("\u2580");
    });

    it("contains Antigravity palette color codes in default emblem", () => {
      const lines = TerminalLogoRenderer.renderHalfBlockLogo();
      const combined = lines.join("\n");

      // Neon Cyan (#00F2FE -> 0, 242, 254)
      expect(combined).toContain(";0;242;254m");

      // Magenta (#F72585 -> 247, 37, 133)
      expect(combined).toContain(";247;37;133m");

      // Dark Onyx (#0A0A0C -> 10, 10, 12)
      expect(combined).toContain(";10;10;12m");

      // Neon Violet (#7209B7 -> 114, 9, 183)
      expect(combined).toContain(";114;9;183m");
    });

    it("supports custom width scaling and cropping", () => {
      const lines12 = TerminalLogoRenderer.renderHalfBlockLogo(12);
      expect(lines12).toHaveLength(4);
      // Count half block characters in each line
      for (const line of lines12) {
        const glyphs = (line.match(/\u2580/g) || []).length;
        expect(glyphs).toBe(12);
      }

      const lines16 = TerminalLogoRenderer.renderHalfBlockLogo(16);
      expect(lines16).toHaveLength(4);
      for (const line of lines16) {
        const glyphs = (line.match(/\u2580/g) || []).length;
        expect(glyphs).toBe(16);
      }

      const lines20 = TerminalLogoRenderer.renderHalfBlockLogo(20);
      expect(lines20).toHaveLength(4);
      for (const line of lines20) {
        const glyphs = (line.match(/\u2580/g) || []).length;
        expect(glyphs).toBe(20);
      }
    });

    it("exports ANTIGRAVITY_PALETTE definitions correctly", () => {
      expect(ANTIGRAVITY_PALETTE.darkOnyx).toEqual([10, 10, 12]);
      expect(ANTIGRAVITY_PALETTE.neonCyan).toEqual([0, 242, 254]);
      expect(ANTIGRAVITY_PALETTE.magenta).toEqual([247, 37, 133]);
      expect(ANTIGRAVITY_PALETTE.neonViolet).toEqual([114, 9, 183]);
    });
  });

  describe("renderGraphicProtocol", () => {
    let mockImagePath: string;

    beforeEach(() => {
      mockImagePath = path.join(testOutputDir, "test-logo.png");
      // Create a mock PNG with valid PNG signature and IHDR (width=128, height=64)
      const pngHeader = Buffer.alloc(32);
      // Magic bytes: \x89PNG\r\n\x1a\n
      pngHeader.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
      // IHDR chunk length 13
      pngHeader.writeUInt32BE(13, 8);
      // "IHDR"
      pngHeader.write("IHDR", 12, "ascii");
      // Width = 128
      pngHeader.writeUInt32BE(128, 16);
      // Height = 64
      pngHeader.writeUInt32BE(64, 20);
      fs.writeFileSync(mockImagePath, pngHeader);
    });

    it("formats Kitty graphics escape sequences with PNG dimensions and base64", () => {
      const output = TerminalLogoRenderer.renderGraphicProtocol("kitty", mockImagePath);
      expect(output).toContain("\x1b_Ga=T,f=100,t=d,s=128,v=64;");
      expect(output).toContain("\x1b\\");
      // Base64 payload exists
      const parts = output.split(";");
      expect(parts.length).toBeGreaterThanOrEqual(2);
    });

    it("formats iTerm2 inline image escape sequences", () => {
      const output = TerminalLogoRenderer.renderGraphicProtocol("iterm2", mockImagePath);
      expect(output.startsWith("\x1b]1337;File=inline=1;width=auto;height=auto:")).toBe(true);
      expect(output.endsWith("\x07")).toBe(true);
    });

    it("formats Sixel graphics escape sequences", () => {
      const output = TerminalLogoRenderer.renderGraphicProtocol("sixel", mockImagePath);
      expect(output.startsWith("\x1bPq")).toBe(true);
      expect(output.endsWith("\x1b\\")).toBe(true);
    });

    it("throws when logo file does not exist", () => {
      expect(() => {
        TerminalLogoRenderer.renderGraphicProtocol("kitty", "/non/existent/path.png");
      }).toThrow(/does not exist/);
    });
  });

  describe("renderHeaderLogo orchestration", () => {
    let mockImagePath: string;

    beforeEach(() => {
      mockImagePath = path.join(testOutputDir, "header-logo.png");
      fs.writeFileSync(mockImagePath, Buffer.from("mock-image-data"));
    });

    it("returns half-block lines when protocol is halfblock", () => {
      const lines = TerminalLogoRenderer.renderHeaderLogo("halfblock", mockImagePath);
      expect(lines).toHaveLength(4);
      expect(lines[0]).toContain("\u2580");
    });

    it("returns half-block lines when graphics file is missing", () => {
      const lines = TerminalLogoRenderer.renderHeaderLogo("kitty", "/non/existent/logo.png");
      expect(lines).toHaveLength(4);
      expect(lines[0]).toContain("\u2580");
    });

    it("returns graphic sequence when graphics file exists and protocol is kitty", () => {
      const lines = TerminalLogoRenderer.renderHeaderLogo("kitty", mockImagePath);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain("\x1b_Ga=T,f=100,t=d");
    });

    it("returns graphic sequence when graphics file exists and protocol is iterm2", () => {
      const lines = TerminalLogoRenderer.renderHeaderLogo("iterm2", mockImagePath);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain("\x1b]1337;File=inline=1;width=auto;height=auto:");
    });

    it("supports options object syntax", () => {
      const lines = TerminalLogoRenderer.renderHeaderLogo({
        protocol: "iterm2",
        logoPath: mockImagePath,
      });
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain("\x1b]1337;File=inline=1");

      const halfblockLines = TerminalLogoRenderer.renderHeaderLogo({
        protocol: "halfblock",
        width: 12,
      });
      expect(halfblockLines).toHaveLength(4);
      const glyphs = (halfblockLines[0]!.match(/\u2580/g) || []).length;
      expect(glyphs).toBe(12);
    });
  });
});
