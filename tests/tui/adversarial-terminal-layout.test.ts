import { describe, it, expect } from "vitest";
import { TerminalLayout } from "../../src/tui/terminal-layout.js";
import { TuiSanitizer } from "../../src/tui/tui-sanitizer.js";

describe("Adversarial Stress-Testing: TerminalLayout (challenger_m3_1)", () => {
  const TEST_WIDTHS = [80, 81, 79, 75, 60, 40, 20, 10, 250];

  const EXTREME_MODELS = [
    undefined,
    "",
    "   ",
    "auto",
    "anthropic/claude-3.5-sonnet",
    "openrouter/deepseek/deepseek-r1:free",
    "a".repeat(50),
    "a".repeat(200),
    "a".repeat(1000),
    "!@#$%^&*()_+-=[]{}|;':\",./<>?",
    "🤖 🚀 ✨ 🐍 🌟",
    "你好世界こんにちは세계",
    "model\twith\ttabs",
    null as unknown as string,
  ];

  // -------------------------------------------------------------------------
  // Suite 1: renderAntigravityHeader Empirical Verification Across All Dimensions & Models
  // -------------------------------------------------------------------------
  describe("Suite 1: renderAntigravityHeader width bounds & extreme models", () => {
    for (const width of TEST_WIDTHS) {
      for (const model of EXTREME_MODELS) {
        const modelDesc = typeof model === "string"
          ? (model.length > 20 ? model.slice(0, 20) + "..." : model)
          : String(model);

        it(`options syntax: width <= ${width} strictly holds for model '${modelDesc}'`, () => {
          const lines = TerminalLayout.renderAntigravityHeader({
            width,
            dimensions: { width, height: 24 },
            activeModel: model,
            status: "ONLINE",
            projectId: "test_proj",
            sessionId: "test_sess",
          });

          expect(lines.length).toBeGreaterThanOrEqual(1);
          for (const line of lines) {
            const visibleLength = TuiSanitizer.stripAnsi(line).length;
            expect(visibleLength).toBeLessThanOrEqual(width);
          }
        });

        it(`positional syntax: width <= ${width} strictly holds for model '${modelDesc}'`, () => {
          const lines = TerminalLayout.renderAntigravityHeader(
            "ONLINE",
            "test_proj",
            "test_sess",
            { width, height: 24 },
            model
          );

          expect(lines.length).toBeGreaterThanOrEqual(1);
          for (const line of lines) {
            const visibleLength = TuiSanitizer.stripAnsi(line).length;
            expect(visibleLength).toBeLessThanOrEqual(width);
          }
        });
      }
    }
  });

  // -------------------------------------------------------------------------
  // Suite 2: Integer Width Sweep (10 to 250) for renderAntigravityHeader
  // -------------------------------------------------------------------------
  describe("Suite 2: Full integer width sweep (10 to 250) for renderAntigravityHeader", () => {
    it("strictly preserves stripAnsi(line).length <= width for all integer widths from 10 to 250", () => {
      for (let w = 10; w <= 250; w++) {
        const lines = TerminalLayout.renderAntigravityHeader(
          "ONLINE",
          "proj",
          "sess",
          { width: w, height: 24 },
          "openrouter/anthropic/claude-3.5-sonnet"
        );
        for (const line of lines) {
          const visLen = TuiSanitizer.stripAnsi(line).length;
          expect(visLen).toBeLessThanOrEqual(w);
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // Suite 3: Prompt Framing and Row Index Arithmetic
  // -------------------------------------------------------------------------
  describe("Suite 3: framePromptLine & getPromptRowIndex", () => {
    it("framePromptLine strictly frames prompt with divider of width w", () => {
      for (const w of TEST_WIDTHS) {
        const framed = TerminalLayout.framePromptLine(" ❯ ask anything...", w);
        expect(framed.length).toBe(2);
        expect(framed[0]).toBe("─".repeat(w));
        expect(framed[1]).toBe(" ❯ ask anything...");
      }
    });

    it("getPromptRowIndex correctly handles totalLines with and without bottomRule", () => {
      for (const totalLines of [0, 1, 10, 24, 50, 100]) {
        expect(TerminalLayout.getPromptRowIndex(totalLines, false)).toBe(Math.max(1, totalLines));
        expect(TerminalLayout.getPromptRowIndex(totalLines, true)).toBe(Math.max(1, totalLines - 1));
      }
    });
  });

  // -------------------------------------------------------------------------
  // Suite 4: Verification of Resolved Defects (Adversarial Remediation)
  // -------------------------------------------------------------------------
  describe("Suite 4: Verification of Resolved Defects (Adversarial Remediation)", () => {
    it("BUG 1 RESOLVED: Normal mode prompt bar strictly satisfies width 80 (no overflow)", () => {
      const lines = TerminalLayout.renderPromptBar({
        width: 80,
        commandPrompt: "",
        isCommandMode: false,
      });

      const promptLine = lines[1]!;
      const visLen = TuiSanitizer.stripAnsi(promptLine).length;

      expect(visLen).toBeLessThanOrEqual(80);
      expect(promptLine).toContain("/ for commands");
      expect(promptLine).toContain("[NORMAL MODE]");
      expect(promptLine).toContain("[1-9] Views, [:] Command, [q] Quit");
    });

    it("BUG 1 RESOLVED: Normal mode prompt bar strictly satisfies all widths from 80 to 91", () => {
      for (let w = 80; w <= 91; w++) {
        const lines = TerminalLayout.renderPromptBar({
          width: w,
          commandPrompt: "",
          isCommandMode: false,
        });
        const visLen = TuiSanitizer.stripAnsi(lines[1]!).length;
        expect(visLen).toBeLessThanOrEqual(w);
      }
    });

    it("BUG 2 RESOLVED: Command mode slash command (/help) strictly satisfies width 60", () => {
      const lines = TerminalLayout.renderPromptBar({
        width: 60,
        commandPrompt: "/help",
        isCommandMode: true,
      });

      const promptLine = lines[1]!;
      const visLen = TuiSanitizer.stripAnsi(promptLine).length;

      expect(visLen).toBeLessThanOrEqual(60);
    });

    it("BUG 3 RESOLVED: Ultra-narrow terminal (width 10 & 20) strictly satisfies width constraints", () => {
      const lines10 = TerminalLayout.renderPromptBar({
        width: 10,
        commandPrompt: "",
        isCommandMode: true,
      });
      const visLen10 = TuiSanitizer.stripAnsi(lines10[1]!).length;
      expect(visLen10).toBeLessThanOrEqual(10);

      const lines20 = TerminalLayout.renderPromptBar({
        width: 20,
        commandPrompt: "",
        isCommandMode: true,
      });
      const visLen20 = TuiSanitizer.stripAnsi(lines20[1]!).length;
      expect(visLen20).toBeLessThanOrEqual(20);
    });

    it("BUG 4 RESOLVED: JavaScript negative zero slice bug resolved, no prompt leak when avail === 0", () => {
      const longPrompt = "a".repeat(200);
      const lines = TerminalLayout.renderPromptBar({
        width: 10,
        commandPrompt: longPrompt,
        isCommandMode: true,
      });
      const visLen = TuiSanitizer.stripAnsi(lines[1]!).length;
      expect(visLen).toBeLessThanOrEqual(10);
    });

    it("BUG 5 RESOLVED: getPromptCursorCol dynamically tracks cursor at width 80 for /models test without freezing", () => {
      const calculatedCol = TerminalLayout.getPromptCursorCol(80, "/models test", 10, true);
      expect(calculatedCol).toBe(33);
      expect(calculatedCol).not.toBe(25);
      expect(calculatedCol).toBeGreaterThan(25);
      expect(calculatedCol).toBeLessThanOrEqual(80);
    });

    it("BUG 6 RESOLVED: Normal mode at width 48 strictly satisfies width 48 without overflowing", () => {
      const lines = TerminalLayout.renderPromptBar({
        width: 48,
        commandPrompt: "",
        isCommandMode: false,
      });
      const visLen = TuiSanitizer.stripAnsi(lines[1]!).length;
      expect(visLen).toBeLessThanOrEqual(48);
    });
  });
});
