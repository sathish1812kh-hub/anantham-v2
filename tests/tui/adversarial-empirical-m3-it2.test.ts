import { describe, it, expect } from "vitest";
import { TerminalLayout } from "../../src/tui/terminal-layout.js";
import { TuiSanitizer } from "../../src/tui/tui-sanitizer.js";

describe("Adversarial Empirical Stress Harness: Milestone 3 Iteration 2", () => {
  const BOUNDARY_WIDTHS = [10, 20, 32, 40, 48, 49, 50, 60, 75, 79, 80, 81, 90, 100, 120, 250];

  // -------------------------------------------------------------------------
  // Suite 1: Full Integer Width Sweep (10 to 250) for renderPromptBar
  // -------------------------------------------------------------------------
  describe("Suite 1: Full Integer Width Sweep (10 to 250) for renderPromptBar", () => {
    it("strictly enforces stripAnsi(line).length <= width for 100% of lines across all integer widths (10..250) and scenarios", () => {
      let totalLinesTested = 0;

      for (let w = 10; w <= 250; w++) {
        const scenarios = [
          // Normal mode scenarios
          { width: w, commandPrompt: "", isCommandMode: false, bottomRule: false },
          { width: w, commandPrompt: "", isCommandMode: false, bottomRule: true },
          { width: w, commandPrompt: "   ", isCommandMode: false, bottomRule: false },

          // Slash command scenarios
          { width: w, commandPrompt: "/", isCommandMode: true, bottomRule: false },
          { width: w, commandPrompt: "/m", isCommandMode: true, bottomRule: false },
          { width: w, commandPrompt: "/models", isCommandMode: true, bottomRule: false },
          { width: w, commandPrompt: "/models openrouter/anthropic/claude-3.5-sonnet", isCommandMode: true, bottomRule: false },
          { width: w, commandPrompt: "/help", isCommandMode: true, bottomRule: true },
          { width: w, commandPrompt: "/cmd " + "a".repeat(300), isCommandMode: true, bottomRule: false },

          // Colon and general command scenarios
          { width: w, commandPrompt: ":", isCommandMode: true, bottomRule: false },
          { width: w, commandPrompt: ":key set openrouter sk-or-v1-abcdef1234567890", isCommandMode: true, bottomRule: false },
          { width: w, commandPrompt: "search " + "word ".repeat(30), isCommandMode: true, bottomRule: false },

          // Adversarial / hostile input scenarios
          { width: w, commandPrompt: "\x1b[31;1mINJECTED\x1b[0m \x1b[?1049h", isCommandMode: true, bottomRule: false },
          { width: w, commandPrompt: "🤖🚀✨🐍🌟".repeat(10), isCommandMode: true, bottomRule: false },
          { width: w, commandPrompt: "你好世界こんにちは".repeat(10), isCommandMode: true, bottomRule: false },
        ];

        for (const opts of scenarios) {
          const lines = TerminalLayout.renderPromptBar(opts);
          expect(lines.length).toBeGreaterThanOrEqual(2);

          for (const line of lines) {
            totalLinesTested++;
            const visibleLength = TuiSanitizer.stripAnsi(line).length;
            expect(visibleLength).toBeLessThanOrEqual(w);
          }
        }
      }

      // Over 241 widths * 15 scenarios * at least 2 lines = > 7,000 line assertions
      expect(totalLinesTested).toBeGreaterThan(7000);
    });
  });

  // -------------------------------------------------------------------------
  // Suite 2: Full Integer Width Sweep (10 to 250) for renderAntigravityHeader
  // -------------------------------------------------------------------------
  describe("Suite 2: Full Integer Width Sweep (10 to 250) for renderAntigravityHeader", () => {
    it("strictly enforces stripAnsi(line).length <= width for 100% of lines across all integer widths (10..250) and model permutations", () => {
      let totalLinesTested = 0;

      for (let w = 10; w <= 250; w++) {
        const testConfigs = [
          // Model variants
          { model: undefined, status: "ONLINE", proj: "proj1", sess: "sess1" },
          { model: "auto", status: "ONLINE", proj: "my-project", sess: "my-session" },
          { model: "openrouter/anthropic/claude-3.5-sonnet", status: "RUNNING", proj: "proj", sess: "sess" },
          { model: "google/gemini-2.5-pro", status: "IDLE", proj: undefined, sess: undefined },
          { model: "meta/llama-3.3-70b-instruct:free", status: "ONLINE", proj: "p", sess: "s" },
          { model: "deepseek/deepseek-r1", status: "BUSY", proj: "anantham-v2-long-project-name", sess: "session-uuid" },
          { model: "a".repeat(150), status: "ONLINE", proj: "long-project-".repeat(5), sess: "sess" },

          // Hostile injections
          { model: "\x1b[38;2;255;0;0mHACK\x1b[0m", status: "CRITICAL", proj: "\x1b[32mOK\x1b[0m", sess: "s" },
          { model: "🤖 🚀 ✨", status: "ONLINE", proj: "🚀", sess: "✨" },
          { model: "!@#$%^&*()_+~`|}{[]:;?><,./", status: "ERR", proj: "proj", sess: "sess" },
        ];

        for (const cfg of testConfigs) {
          // Test options object overload
          const linesObj = TerminalLayout.renderAntigravityHeader({
            width: w,
            dimensions: { width: w, height: 24 },
            activeModel: cfg.model,
            status: cfg.status,
            projectId: cfg.proj,
            sessionId: cfg.sess,
          });

          // Test positional parameter overload
          const linesPos = TerminalLayout.renderAntigravityHeader(
            cfg.status,
            cfg.proj,
            cfg.sess,
            { width: w, height: 24 },
            cfg.model
          );

          for (const lines of [linesObj, linesPos]) {
            if (w < 80) {
              expect(lines.length).toBe(1);
            } else {
              expect(lines.length).toBe(2);
            }

            for (const line of lines) {
              totalLinesTested++;
              const visibleLength = TuiSanitizer.stripAnsi(line).length;
              expect(visibleLength).toBeLessThanOrEqual(w);
            }
          }
        }
      }

      // Over 241 widths * 10 configs * 2 overloads * at least 1 line = > 7,000 line assertions
      expect(totalLinesTested).toBeGreaterThan(7000);
    });
  });

  // -------------------------------------------------------------------------
  // Suite 3: Boundary Matrix Explicit Assertions
  // -------------------------------------------------------------------------
  describe("Suite 3: Boundary Matrix Explicit Checks (10, 20, 32, 40, 48, 49, 50, 60, 75, 79, 80, 81, 90, 100, 120, 250)", () => {
    for (const w of BOUNDARY_WIDTHS) {
      it(`width ${w}: normal mode renderPromptBar strictly satisfies width and contents`, () => {
        const lines = TerminalLayout.renderPromptBar({ width: w, commandPrompt: "", isCommandMode: false });
        expect(lines.length).toBe(2);
        expect(lines[0]!.length).toBe(w);
        const promptLine = lines[1]!;
        const visLen = TuiSanitizer.stripAnsi(promptLine).length;
        expect(visLen).toBeLessThanOrEqual(w);

        if (w >= 92) {
          expect(promptLine).toContain("ask anything or type / for commands");
          expect(promptLine).toContain("[NORMAL MODE]");
        } else if (w >= 80) {
          expect(promptLine).toContain("/ for commands");
          expect(promptLine).toContain("[NORMAL MODE]");
        } else if (w >= 49) {
          expect(promptLine).toContain("[NORMAL MODE]");
        } else if (w >= 32) {
          expect(promptLine).toContain("[NORMAL]");
        }
      });

      it(`width ${w}: slash command renderPromptBar strictly satisfies width`, () => {
        const lines = TerminalLayout.renderPromptBar({
          width: w,
          commandPrompt: "/models openrouter/anthropic/claude-3.5-sonnet",
          isCommandMode: true,
        });
        expect(lines.length).toBe(2);
        for (const line of lines) {
          expect(TuiSanitizer.stripAnsi(line).length).toBeLessThanOrEqual(w);
        }
      });

      it(`width ${w}: renderAntigravityHeader strictly satisfies width and dock contracts`, () => {
        const lines = TerminalLayout.renderAntigravityHeader("ONLINE", "test_proj", "test_sess", { width: w, height: 24 }, "openrouter/anthropic/claude-3.5-sonnet");

        if (w >= 80) {
          expect(lines.length).toBe(2);
          const line1Plain = TuiSanitizer.stripAnsi(lines[0]!);
          const line2Plain = TuiSanitizer.stripAnsi(lines[1]!);

          expect(line1Plain).toContain("ANANTHAM INFINITE TUI");
          expect(line2Plain).toContain("ANTIGRAVITY HARNESS");
          expect(line2Plain).toContain("GATEWAY: OpenRouter");
          expect(line2Plain).toContain("MODEL:");
          // When width is tight (e.g. 80 or 120 with full right dock), model is cleanly truncated to fit without line-wrap
          expect(line2Plain).toMatch(/claude|claud/);
        } else {
          expect(lines.length).toBe(1);
          if (w >= 60) {
            expect(lines[0]!).toContain("Status: [ONLINE]");
          } else if (w >= 20) {
            expect(lines[0]!).toContain("[ONLINE]");
          }
        }

        for (const line of lines) {
          expect(TuiSanitizer.stripAnsi(line).length).toBeLessThanOrEqual(w);
        }
      });
    }
  });

  // -------------------------------------------------------------------------
  // Suite 4: Dynamic Cursor Column Positioning & Monotonic Tracking Stress Harness
  // -------------------------------------------------------------------------
  describe("Suite 4: Dynamic Cursor Column Positioning & Monotonic Tracking", () => {
    it("normal mode: cursor column is strictly 1 across all widths from 10 to 250", () => {
      for (let w = 10; w <= 250; w++) {
        expect(TerminalLayout.getPromptCursorCol(w, "", 0, false)).toBe(1);
        expect(TerminalLayout.getPromptCursorCol(w, "any text", 5, false)).toBe(1);
      }
    });

    it("command mode: bounds check 1 <= col <= width strictly holds for all cursor positions, lengths, and widths", () => {
      for (const w of BOUNDARY_WIDTHS) {
        for (const prompt of ["", "/", "/help", "/models claude-3.5-sonnet", "x".repeat(100)]) {
          for (let pos = -5; pos <= prompt.length + 5; pos++) {
            const col = TerminalLayout.getPromptCursorCol(w, prompt, pos, true);
            expect(col).toBeGreaterThanOrEqual(1);
            expect(col).toBeLessThanOrEqual(w);
          }
        }
      }
    });

    it("typing progression: cursor column advances monotonically as characters are typed", () => {
      const fullCommand = "/models openrouter/anthropic/claude-3.5-sonnet:beta";

      for (const w of [60, 80, 100, 120]) {
        let prevCol = 0;
        for (let i = 1; i <= fullCommand.length; i++) {
          const currentPrompt = fullCommand.slice(0, i);
          const col = TerminalLayout.getPromptCursorCol(w, currentPrompt, i, true);

          // As user types at the end of the input, cursor position must advance or reach max column
          expect(col).toBeGreaterThanOrEqual(prevCol);
          expect(col).toBeLessThanOrEqual(w);
          prevCol = col;
        }
      }
    });

    it("backspace progression: cursor column decreases monotonically as characters are deleted", () => {
      const fullCommand = "/models openrouter/anthropic/claude-3.5-sonnet:beta";

      for (const w of [60, 80, 100, 120]) {
        let prevCol = w + 1;
        for (let i = fullCommand.length; i >= 1; i--) {
          const currentPrompt = fullCommand.slice(0, i);
          const col = TerminalLayout.getPromptCursorCol(w, currentPrompt, i, true);

          expect(col).toBeLessThanOrEqual(prevCol);
          expect(col).toBeGreaterThanOrEqual(1);
          prevCol = col;
        }
      }
    });

    it("cursor positioning aligns with visible prompt characters during horizontal scrolling", () => {
      const longPrompt = "01234567890123456789012345678901234567890123456789"; // 50 chars
      const width = 40;

      const { visPrefixLen, visSuffixLen } = TerminalLayout.getPromptDecorations(width, longPrompt);
      const avail = width - visPrefixLen - visSuffixLen; // visible prompt width

      // When cursor is at the end of the long prompt
      const colAtEnd = TerminalLayout.getPromptCursorCol(width, longPrompt, longPrompt.length, true);
      // Cursor should be at the right edge of the visible prompt window (prefix + avail + 1)
      expect(colAtEnd).toBe(visPrefixLen + avail + 1);
      expect(colAtEnd).toBeLessThanOrEqual(width);

      // When cursor moves all the way left into the scrolled out region (pos = 0)
      const colAtStart = TerminalLayout.getPromptCursorCol(width, longPrompt, 0, true);
      // Cursor should clamp to the beginning of the prompt area (visPrefixLen + 1)
      expect(colAtStart).toBe(visPrefixLen + 1);
    });

    it("verifies cursor column is never frozen at constant 25 for slash commands", () => {
      const prompts = [
        "/a",
        "/ab",
        "/abc",
        "/abcd",
        "/models",
        "/models test",
        "/models openrouter/anthropic/claude-3.5-sonnet",
      ];

      const cols = prompts.map((p) => TerminalLayout.getPromptCursorCol(80, p, p.length, true));
      // Ensure we have a spread of distinct column positions, not a single frozen value
      const uniqueCols = new Set(cols);
      expect(uniqueCols.size).toBeGreaterThan(4);
    });
  });

  // -------------------------------------------------------------------------
  // Suite 5: Extreme Stress & Pathological Edge Cases
  // -------------------------------------------------------------------------
  describe("Suite 5: Extreme Stress & Pathological Edge Cases", () => {
    it("handles 1000-character input prompts without performance degradation or line-wrap", () => {
      const megaPrompt = "/command " + "xyz".repeat(333);
      for (const w of BOUNDARY_WIDTHS) {
        const lines = TerminalLayout.renderPromptBar({
          width: w,
          commandPrompt: megaPrompt,
          isCommandMode: true,
        });

        for (const line of lines) {
          expect(TuiSanitizer.stripAnsi(line).length).toBeLessThanOrEqual(w);
        }

        const col = TerminalLayout.getPromptCursorCol(w, megaPrompt, megaPrompt.length, true);
        expect(col).toBeGreaterThanOrEqual(1);
        expect(col).toBeLessThanOrEqual(w);
      }
    });

    it("handles null, undefined, and non-string activeModel gracefully without throwing", () => {
      for (const w of [60, 80, 100]) {
        expect(() => {
          TerminalLayout.renderAntigravityHeader({
            width: w,
            activeModel: null as unknown as string,
            status: "ONLINE",
          });
        }).not.toThrow();

        expect(() => {
          TerminalLayout.renderAntigravityHeader({
            width: w,
            activeModel: undefined,
            status: "ONLINE",
          });
        }).not.toThrow();
      }
    });

    it("verifies zero escape sequence leaks (no dangling escapes) across all rendered lines", () => {
      for (const w of [40, 60, 80, 100, 120]) {
        const headerLines = TerminalLayout.renderAntigravityHeader("ONLINE", "proj", "sess", { width: w, height: 24 }, "model");
        const promptLines = TerminalLayout.renderPromptBar({ width: w, commandPrompt: "/test", isCommandMode: true, bottomRule: true });

        for (const line of [...headerLines, ...promptLines]) {
          // Sanitizer must cleanly strip all ANSI without leaving orphan bracket sequences
          const stripped = TuiSanitizer.stripAnsi(line);
          expect(stripped).not.toMatch(/\x1b/);
          expect(stripped).not.toMatch(/\[\d+;\d+;\d+m/);
          expect(stripped).not.toMatch(/\[\d+m/);
        }
      }
    });
  });
});
