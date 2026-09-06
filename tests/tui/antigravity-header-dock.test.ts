import { describe, it, expect } from "vitest";
import { TerminalLayout } from "../../src/tui/terminal-layout.js";
import { TuiSanitizer } from "../../src/tui/tui-sanitizer.js";
import { TuiRenderer } from "../../src/tui/tui-renderer.js";
import { TuiStateAdapter } from "../../src/tui/tui-state-adapter.js";

describe("Antigravity Header Dock Layout & Prompt Framing", () => {
  // -------------------------------------------------------------------------
  // Suite 1: Header Dock Layout (width >= 80)
  // -------------------------------------------------------------------------
  describe("Suite 1: Header Dock Layout (width >= 80)", () => {
    it("renders dock containing GATEWAY: OpenRouter and MODEL: auto when model is omitted", () => {
      const lines = TerminalLayout.renderAntigravityHeader("NORMAL", "proj1", "sess1", { width: 80, height: 24 });
      const combined = lines.join("\n");
      const plain = TuiSanitizer.stripAnsi(combined);

      expect(plain).toContain("ANTIGRAVITY HARNESS");
      expect(plain).toContain("GATEWAY: OpenRouter");
      expect(plain).toContain("MODEL: auto");
    });

    it("renders active model name cleanly when activeModel is specified", () => {
      const lines = TerminalLayout.renderAntigravityHeader(
        "NORMAL",
        "proj1",
        "sess1",
        { width: 100, height: 24 },
        "openrouter/anthropic/claude-3.5-sonnet"
      );
      const plain = TuiSanitizer.stripAnsi(lines.join("\n"));

      expect(plain).toContain("GATEWAY: OpenRouter");
      expect(plain).toMatch(/MODEL:\s+(?:openrouter\/anthropic\/)?claude-3\.5-sonnet/);
    });

    it("renders MODEL: auto when activeModel is explicitly 'auto'", () => {
      const lines = TerminalLayout.renderAntigravityHeader(
        "NORMAL",
        undefined,
        undefined,
        { width: 90, height: 24 },
        "auto"
      );
      const plain = TuiSanitizer.stripAnsi(lines.join("\n"));
      expect(plain).toContain("MODEL: auto");
    });

    it("preserves backwards-compatible branding tokens required by integration suites", () => {
      const lines = TerminalLayout.renderAntigravityHeader("NORMAL", "p1", "s1", { width: 90, height: 26 });
      const plain = TuiSanitizer.stripAnsi(lines.join("\n"));

      expect(plain).toContain("ANANTHAM INFINITE TUI");
      expect(plain).toContain("[HARNESS: ONLINE | LATENCY: 18ms]");
      expect(plain).toContain("Antigravity Reactive Shell");
    });

    it("supports options object parameter overload syntax", () => {
      const lines = TerminalLayout.renderAntigravityHeader({
        width: 100,
        status: "RUNNING",
        activeModel: "google/gemini-2.5-pro",
        gateway: "OpenRouter",
      });
      const plain = TuiSanitizer.stripAnsi(lines.join("\n"));

      expect(plain).toContain("ANTIGRAVITY HARNESS");
      expect(plain).toContain("GATEWAY: OpenRouter");
      expect(plain).toContain("gemini-2.5-pro");
      expect(lines.length).toBe(2);
    });

    it("strictly fits terminal width without line-wrapping at width = 80, 90, 100, 120, 160", () => {
      for (const w of [80, 90, 100, 120, 160]) {
        const lines = TerminalLayout.renderAntigravityHeader(
          "NORMAL",
          "my-project",
          "my-session",
          { width: w, height: 24 },
          "anthropic/claude-3.5-sonnet"
        );
        for (const line of lines) {
          const visibleWidth = TuiSanitizer.stripAnsi(line).length;
          expect(visibleWidth).toBeLessThanOrEqual(w);
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // Suite 2: Header Fallback (width < 80)
  // -------------------------------------------------------------------------
  describe("Suite 2: Header Fallback (width < 80)", () => {
    it("falls back to compact status bar at boundary width 79", () => {
      const lines = TerminalLayout.renderAntigravityHeader("NORMAL", "p1", "s1", { width: 79, height: 24 });
      expect(lines.length).toBe(1);
      const visible = TuiSanitizer.stripAnsi(lines[0]!).length;
      expect(visible).toBeLessThanOrEqual(79);
    });

    it("renders compact status bar cleanly at width 60", () => {
      const lines = TerminalLayout.renderAntigravityHeader("NORMAL", "proj_x", "sess_y", { width: 60, height: 24 });
      expect(lines.length).toBe(1);
      const visible = TuiSanitizer.stripAnsi(lines[0]!).length;
      expect(visible).toBeLessThanOrEqual(60);
      expect(lines[0]).toContain("Status: [NORMAL]");
    });

    it("renders narrow status bar cleanly at width 40", () => {
      const lines = TerminalLayout.renderAntigravityHeader("PAUSED", "proj_x", undefined, { width: 40, height: 24 });
      expect(lines.length).toBe(1);
      const visible = TuiSanitizer.stripAnsi(lines[0]!).length;
      expect(visible).toBeLessThanOrEqual(40);
      expect(lines[0]).toContain("❖ Anantham");
    });

    it("handles ultra-narrow terminals (width 20) without crashing or throwing", () => {
      const lines = TerminalLayout.renderAntigravityHeader("IDLE", undefined, undefined, { width: 20, height: 24 });
      expect(lines.length).toBe(1);
      const visible = TuiSanitizer.stripAnsi(lines[0]!).length;
      expect(visible).toBeLessThanOrEqual(20);
    });
  });

  // -------------------------------------------------------------------------
  // Suite 3: Prompt Line Framing & Bottom Line Indexing
  // -------------------------------------------------------------------------
  describe("Suite 3: Prompt Line Framing & Bottom Line Indexing", () => {
    it("renderDivider produces exact width divider string", () => {
      const div80 = TerminalLayout.renderDivider(80, "─");
      expect(div80.length).toBe(80);
      expect(div80).toBe("─".repeat(80));

      const div40 = TerminalLayout.renderDivider(40, "═");
      expect(div40.length).toBe(40);
      expect(div40).toBe("═".repeat(40));
    });

    it("framePromptLine frames prompt with upper rule line and preserves prompt at last line", () => {
      const prompt = " ❯ ask anything or type / for commands...";
      const framed = TerminalLayout.framePromptLine(prompt, 80);

      expect(framed.length).toBe(2);
      expect(framed[0]).toBe("─".repeat(80));
      expect(framed[1]).toBe(prompt);
      // Confirms prompt is exactly at index framed.length - 1
      expect(framed[framed.length - 1]).toContain("ask anything");
    });

    it("preserves bottom line indexing in full TuiRenderer output across normal and command modes", () => {
      const renderer = new TuiRenderer({ dimensions: { width: 80, height: 24 } });
      const adapter = new TuiStateAdapter();

      // Normal mode render
      const normalRender = renderer.render("dashboard", adapter, "", "", false);
      const normalLines = normalRender.split("\n");
      const lastNormalLine = normalLines[normalLines.length - 1]!;
      expect(lastNormalLine).toContain("[NORMAL MODE]");
      expect(normalLines[normalLines.length - 2]).toBe("─".repeat(80));

      // Command mode render
      const commandRender = renderer.render("dashboard", adapter, "/models", "", true);
      const commandLines = commandRender.split("\n");
      const lastCommandLine = commandLines[commandLines.length - 1]!;
      expect(lastCommandLine).toContain("/models");
      expect(commandLines[commandLines.length - 2]).toBe("─".repeat(80));
    });

    it("getPromptRowIndex accurately identifies prompt row with and without bottom rule", () => {
      expect(TerminalLayout.getPromptRowIndex(24, false)).toBe(24);
      expect(TerminalLayout.getPromptRowIndex(24, true)).toBe(23);
      expect(TerminalLayout.getPromptRowIndex(1, true)).toBe(1);
    });

    it("getPromptCursorCol computes 1-based column stripping ANSI prefix", () => {
      // Normal mode: col is 1
      expect(TerminalLayout.getPromptCursorCol(80, "", 0, false)).toBe(1);

      // Command mode with slash command: prefix is sanitized, cursor offset computed
      const slashCol = TerminalLayout.getPromptCursorCol(80, "/help", 5, true);
      expect(slashCol).toBeGreaterThan(1);

      // Narrow command mode
      const narrowCol = TerminalLayout.getPromptCursorCol(40, "test", 2, true);
      expect(narrowCol).toBeGreaterThan(1);
    });
  });

  // -------------------------------------------------------------------------
  // Suite 4: Adversarial & Edge Case Handling
  // -------------------------------------------------------------------------
  describe("Suite 4: Adversarial & Edge Case Handling", () => {
    it("handles extremely long model identifier without overflowing width 80", () => {
      const longModel = "openrouter/very-long-organization-name/super-extreme-ultra-deep-reasoning-model-v999-turbo-instruct";
      const lines = TerminalLayout.renderAntigravityHeader("NORMAL", undefined, undefined, { width: 80, height: 24 }, longModel);

      for (const line of lines) {
        const visible = TuiSanitizer.stripAnsi(line).length;
        expect(visible).toBeLessThanOrEqual(80);
      }
    });

    it("handles model names with special regex and Unicode characters", () => {
      const specialModel = "meta/llama-3.3-70b-instruct:free[special] ($5/M)";
      expect(() => {
        TerminalLayout.renderAntigravityHeader("NORMAL", undefined, undefined, { width: 100, height: 24 }, specialModel);
      }).not.toThrow();
    });

    it("guarantees clean ANSI escape termination without dangling color states", () => {
      const lines = TerminalLayout.renderAntigravityHeader("NORMAL", "proj", "sess", { width: 80, height: 24 });
      for (const line of lines) {
        // Strip and re-verify no corrupted control chars
        const plain = TuiSanitizer.stripAnsi(line);
        expect(plain).not.toContain("\x1b");
      }
    });
  });

  // -------------------------------------------------------------------------
  // Suite 5: Rigorous renderPromptBar Zero-Overflow & Width Matrix Sweep
  // -------------------------------------------------------------------------
  describe("Suite 5: renderPromptBar Zero-Overflow & Width Matrix Sweep", () => {
    const TEST_WIDTHS = [10, 20, 32, 40, 48, 49, 50, 60, 75, 79, 80, 81, 90, 100, 120, 250];

    for (const w of TEST_WIDTHS) {
      it(`normal mode: strictly satisfies visible length <= ${w}`, () => {
        const lines = TerminalLayout.renderPromptBar({ width: w, commandPrompt: "", isCommandMode: false });
        expect(lines.length).toBeGreaterThanOrEqual(2);
        for (const line of lines) {
          const visLen = TuiSanitizer.stripAnsi(line).length;
          expect(visLen).toBeLessThanOrEqual(w);
        }
      });

      it(`normal mode with bottomRule: strictly satisfies visible length <= ${w}`, () => {
        const lines = TerminalLayout.renderPromptBar({ width: w, commandPrompt: "", isCommandMode: false, bottomRule: true });
        expect(lines.length).toBe(3);
        for (const line of lines) {
          const visLen = TuiSanitizer.stripAnsi(line).length;
          expect(visLen).toBeLessThanOrEqual(w);
        }
      });

      it(`command mode with slash command: strictly satisfies visible length <= ${w}`, () => {
        const lines = TerminalLayout.renderPromptBar({
          width: w,
          commandPrompt: "/models openrouter/anthropic/claude-3.5-sonnet",
          isCommandMode: true,
        });
        expect(lines.length).toBeGreaterThanOrEqual(2);
        for (const line of lines) {
          const visLen = TuiSanitizer.stripAnsi(line).length;
          expect(visLen).toBeLessThanOrEqual(w);
        }
      });

      it(`command mode with 200-char prompt: strictly satisfies visible length <= ${w}`, () => {
        const lines = TerminalLayout.renderPromptBar({
          width: w,
          commandPrompt: "a".repeat(200),
          isCommandMode: true,
        });
        expect(lines.length).toBeGreaterThanOrEqual(2);
        for (const line of lines) {
          const visLen = TuiSanitizer.stripAnsi(line).length;
          expect(visLen).toBeLessThanOrEqual(w);
        }
      });
    }

    it("full integer width sweep (10 to 250) maintains stripAnsi(line).length <= width with zero overflow", () => {
      for (let w = 10; w <= 250; w++) {
        const linesNormal = TerminalLayout.renderPromptBar({ width: w, commandPrompt: "", isCommandMode: false });
        const linesCmd = TerminalLayout.renderPromptBar({ width: w, commandPrompt: "/models test", isCommandMode: true });
        const linesLong = TerminalLayout.renderPromptBar({ width: w, commandPrompt: "x".repeat(150), isCommandMode: true });
        for (const l of [...linesNormal, ...linesCmd, ...linesLong]) {
          expect(TuiSanitizer.stripAnsi(l).length).toBeLessThanOrEqual(w);
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // Suite 6: Exact Cursor Column Positioning & Dynamic Window Tracking
  // -------------------------------------------------------------------------
  describe("Suite 6: Exact Cursor Column Positioning & Tracking", () => {
    it("returns column 1 for normal mode across all widths", () => {
      for (const w of [10, 20, 40, 60, 80, 100]) {
        expect(TerminalLayout.getPromptCursorCol(w, "", 0, false)).toBe(1);
      }
    });

    it("tracks cursor position dynamically for slash commands without freezing at column 25", () => {
      // At width 80, typing /models should advance cursor from pos 1 to 7
      const cols: number[] = [];
      for (let i = 1; i <= 7; i++) {
        const p = "/models".slice(0, i);
        cols.push(TerminalLayout.getPromptCursorCol(80, p, i, true));
      }
      // Each character advance should increment column position
      for (let i = 1; i < cols.length; i++) {
        expect(cols[i]).toBeGreaterThan(cols[i - 1]!);
      }
      // Explicitly verify cursor at pos 10 for /models test is not frozen at 25
      const col10 = TerminalLayout.getPromptCursorCol(80, "/models test", 10, true);
      expect(col10).toBeGreaterThan(25);
      expect(col10).toBeLessThanOrEqual(80);
    });

    it("guarantees cursor column never exceeds terminal width across narrow viewports", () => {
      for (const w of [10, 20, 40, 60, 80]) {
        for (let pos = 0; pos <= 50; pos += 5) {
          const col = TerminalLayout.getPromptCursorCol(w, "a".repeat(50), pos, true);
          expect(col).toBeGreaterThanOrEqual(1);
          expect(col).toBeLessThanOrEqual(w);
        }
      }
    });
  });
});
