import { describe, it, expect } from "vitest";
import { TerminalLayout } from "../../src/tui/terminal-layout.js";
import { TuiSanitizer } from "../../src/tui/tui-sanitizer.js";

/**
 * Empirical Stress Test Harness authored by challenger_m3_it2_1.
 * 
 * Verifies:
 * 1. TerminalLayout.renderPromptBar across all integer widths 10 to 250.
 * 2. TerminalLayout.renderAntigravityHeader across all integer widths 10 to 250.
 * 3. Strict invariant: TuiSanitizer.stripAnsi(line).length <= width holds for 100% of lines.
 * 4. TerminalLayout.getPromptCursorCol bounds [1, width], monotonicity, and scrolling behavior.
 */
describe("Challenger M3 Iteration 2: Empirical Stress Test Suite", () => {
  const ALL_INTEGER_WIDTHS: number[] = [];
  for (let w = 10; w <= 250; w++) {
    ALL_INTEGER_WIDTHS.push(w);
  }

  const CRITICAL_EDGE_WIDTHS = [10, 15, 20, 24, 25, 31, 32, 48, 49, 50, 52, 53, 60, 69, 70, 75, 79, 80, 81, 89, 90, 91, 92, 100, 119, 120, 160, 200, 250];

  // =========================================================================
  // SECTION 1: renderPromptBar Stress Across All Widths (10 to 250)
  // =========================================================================
  describe("Section 1: renderPromptBar Strict Line-Length Invariant (10 to 250)", () => {
    it("strictly enforces stripAnsi(line).length <= width for Normal Mode across all integer widths 10..250", () => {
      let totalLinesChecked = 0;
      for (const w of ALL_INTEGER_WIDTHS) {
        const lines = TerminalLayout.renderPromptBar({
          width: w,
          commandPrompt: "",
          isCommandMode: false,
          bottomRule: false,
        });

        expect(lines.length).toBe(2);
        for (const line of lines) {
          totalLinesChecked++;
          const visLen = TuiSanitizer.stripAnsi(line).length;
          expect(visLen).toBeLessThanOrEqual(w);
        }
      }
      expect(totalLinesChecked).toBe(ALL_INTEGER_WIDTHS.length * 2);
    });

    it("strictly enforces stripAnsi(line).length <= width for Normal Mode with bottomRule across all integer widths 10..250", () => {
      let totalLinesChecked = 0;
      for (const w of ALL_INTEGER_WIDTHS) {
        const lines = TerminalLayout.renderPromptBar({
          width: w,
          commandPrompt: "",
          isCommandMode: false,
          bottomRule: true,
        });

        expect(lines.length).toBe(3);
        for (const line of lines) {
          totalLinesChecked++;
          const visLen = TuiSanitizer.stripAnsi(line).length;
          expect(visLen).toBeLessThanOrEqual(w);
        }
      }
      expect(totalLinesChecked).toBe(ALL_INTEGER_WIDTHS.length * 3);
    });

    it("strictly enforces stripAnsi(line).length <= width for Slash Commands across all integer widths 10..250", () => {
      const slashPrompts = [
        "/",
        "/h",
        "/help",
        "/models",
        "/models openrouter/anthropic/claude-3.5-sonnet",
        "/key set openrouter sk-or-v1-0123456789abcdef0123456789abcdef0123456789",
        "/teamwork-preview",
        "/usage",
      ];

      for (const prompt of slashPrompts) {
        for (const w of ALL_INTEGER_WIDTHS) {
          const lines = TerminalLayout.renderPromptBar({
            width: w,
            commandPrompt: prompt,
            isCommandMode: true,
            bottomRule: false,
          });

          expect(lines.length).toBe(2);
          for (const line of lines) {
            const visLen = TuiSanitizer.stripAnsi(line).length;
            expect(visLen).toBeLessThanOrEqual(w);
          }
        }
      }
    });

    it("strictly enforces stripAnsi(line).length <= width for Colon and Plain Commands across all integer widths 10..250", () => {
      const commands = [
        ":",
        ":w",
        ":models",
        "plain command text without slash or colon prefix",
        "a".repeat(150),
        "b".repeat(300),
      ];

      for (const prompt of commands) {
        for (const w of ALL_INTEGER_WIDTHS) {
          const lines = TerminalLayout.renderPromptBar({
            width: w,
            commandPrompt: prompt,
            isCommandMode: true,
            bottomRule: false,
          });

          for (const line of lines) {
            const visLen = TuiSanitizer.stripAnsi(line).length;
            expect(visLen).toBeLessThanOrEqual(w);
          }
        }
      }
    });

    it("strictly enforces stripAnsi(line).length <= width for Adversarial Characters (ANSI, Unicode, control chars)", () => {
      const adversarialPrompts = [
        "prompt with \x1b[31;1mred text\x1b[0m and \x1b[42mgreen bg\x1b[0m",
        "🤖 🚀 ✨ 🐍 🌟 こんにちは 世界 123",
        "line with \t tabs and \r\n linebreaks and \0 null bytes",
        "!@#$%^&*()_+~`-={}|[]\\:\";'<>?,./",
        "   leading and trailing spaces   ",
      ];

      for (const prompt of adversarialPrompts) {
        for (const w of ALL_INTEGER_WIDTHS) {
          const lines = TerminalLayout.renderPromptBar({
            width: w,
            commandPrompt: prompt,
            isCommandMode: true,
          });

          for (const line of lines) {
            const visLen = TuiSanitizer.stripAnsi(line).length;
            expect(visLen).toBeLessThanOrEqual(w);
          }
        }
      }
    });

    it("verifies responsive Normal Mode layout content across tier boundaries", () => {
      // Tier 1: width >= 92: full prompt + full rightMode
      const lines92 = TerminalLayout.renderPromptBar({ width: 92, commandPrompt: "", isCommandMode: false });
      expect(lines92[1]).toContain("ask anything or type / for commands...");
      expect(lines92[1]).toContain("[NORMAL MODE]");
      expect(lines92[1]).toContain("[1-9] Views, [:] Command, [q] Quit");
      expect(TuiSanitizer.stripAnsi(lines92[1]!).length).toBeLessThanOrEqual(92);

      // Tier 2: 80 <= width < 92: compact leftPrompt + full rightMode
      for (let w = 80; w < 92; w++) {
        const lines = TerminalLayout.renderPromptBar({ width: w, commandPrompt: "", isCommandMode: false });
        expect(lines[1]).toContain("/ for commands");
        expect(lines[1]).toContain("[NORMAL MODE]");
        expect(lines[1]).toContain("[1-9] Views, [:] Command, [q] Quit");
        expect(TuiSanitizer.stripAnsi(lines[1]!).length).toBeLessThanOrEqual(w);
      }

      // Tier 3: 53 <= width < 80: compact rightMode only with logo
      const lines53 = TerminalLayout.renderPromptBar({ width: 53, commandPrompt: "", isCommandMode: false });
      expect(lines53[1]).toContain("[NORMAL MODE]");
      expect(lines53[1]).toContain("[1-9] Views, [:] Command, [q] Quit");
      expect(TuiSanitizer.stripAnsi(lines53[1]!).length).toBeLessThanOrEqual(53);

      // Tier 4: 49 <= width < 53: rightMode without logo
      const lines49 = TerminalLayout.renderPromptBar({ width: 49, commandPrompt: "", isCommandMode: false });
      expect(lines49[1]).toContain("[NORMAL MODE]");
      expect(lines49[1]).toContain("[1-9] Views, [:] Command, [q] Quit");
      expect(TuiSanitizer.stripAnsi(lines49[1]!).length).toBeLessThanOrEqual(49);

      // Tier 5: 32 <= width < 49: compact navigation
      const lines32 = TerminalLayout.renderPromptBar({ width: 32, commandPrompt: "", isCommandMode: false });
      expect(lines32[1]).toContain("[NORMAL] [:] Cmd, [q] Quit");
      expect(TuiSanitizer.stripAnsi(lines32[1]!).length).toBeLessThanOrEqual(32);

      // Tier 6: width < 32: ultra-compact truncated
      const lines20 = TerminalLayout.renderPromptBar({ width: 20, commandPrompt: "", isCommandMode: false });
      expect(TuiSanitizer.stripAnsi(lines20[1]!).length).toBeLessThanOrEqual(20);

      const lines10 = TerminalLayout.renderPromptBar({ width: 10, commandPrompt: "", isCommandMode: false });
      expect(TuiSanitizer.stripAnsi(lines10[1]!).length).toBeLessThanOrEqual(10);
    });
  });

  // =========================================================================
  // SECTION 2: renderAntigravityHeader Stress Across All Widths (10 to 250)
  // =========================================================================
  describe("Section 2: renderAntigravityHeader Strict Line-Length Invariant (10 to 250)", () => {
    it("strictly enforces stripAnsi(line).length <= width across all integer widths 10..250 (Options Syntax)", () => {
      const testConfigs = [
        { desc: "default/empty options", opts: {} },
        { desc: "standard model", opts: { activeModel: "openrouter/anthropic/claude-3.5-sonnet", status: "ONLINE", projectId: "anantham-core" } },
        { desc: "long model and project", opts: { activeModel: "deepseek/deepseek-r1-distill-llama-70b-free", status: "PROCESSING", projectId: "very-long-project-name-ident-12345" } },
        { desc: "extreme 200-char model", opts: { activeModel: "m".repeat(200), status: "ONLINE", projectId: "proj" } },
        { desc: "extreme custom gateway", opts: { gateway: "MyExtremelyLongCustomGatewayNameThatExceedsNormalBounds", activeModel: "auto" } },
        { desc: "model with unicode/emojis", opts: { activeModel: "🤖 🚀 custom-model-v2:alpha", status: "ACTIVE" } },
      ];

      for (const config of testConfigs) {
        for (const w of ALL_INTEGER_WIDTHS) {
          const lines = TerminalLayout.renderAntigravityHeader({
            ...config.opts,
            width: w,
            dimensions: { width: w, height: 24 },
          });

          // Check line count
          if (w < 80) {
            expect(lines.length).toBe(1);
          } else {
            expect(lines.length).toBe(2);
          }

          // Check visible length invariant for 100% of lines
          for (const line of lines) {
            const visLen = TuiSanitizer.stripAnsi(line).length;
            expect(visLen).toBeLessThanOrEqual(w);
          }
        }
      }
    });

    it("strictly enforces stripAnsi(line).length <= width across all integer widths 10..250 (Positional Syntax)", () => {
      const models = [
        undefined,
        "auto",
        "anthropic/claude-3.5-sonnet",
        "openai/gpt-4o",
        "openrouter/google/gemini-2.5-pro",
        "x".repeat(100),
      ];

      for (const model of models) {
        for (const w of ALL_INTEGER_WIDTHS) {
          const lines = TerminalLayout.renderAntigravityHeader(
            "ONLINE",
            "test-project",
            "test-session",
            { width: w, height: 24 },
            model
          );

          if (w < 80) {
            expect(lines.length).toBe(1);
          } else {
            expect(lines.length).toBe(2);
          }

          for (const line of lines) {
            const visLen = TuiSanitizer.stripAnsi(line).length;
            expect(visLen).toBeLessThanOrEqual(w);
          }
        }
      }
    });

    it("strictly verifies docked header content for width >= 80", () => {
      for (const w of [80, 81, 89, 90, 92, 100, 120, 160, 250]) {
        const lines = TerminalLayout.renderAntigravityHeader({
          width: w,
          activeModel: "openrouter/anthropic/claude-3.5-sonnet",
          gateway: "OpenRouter",
        });

        expect(lines.length).toBe(2);
        const line2Plain = TuiSanitizer.stripAnsi(lines[1]!);

        expect(line2Plain).toContain("ANTIGRAVITY HARNESS");
        expect(line2Plain).toContain("GATEWAY: OpenRouter");
        expect(line2Plain).toContain("MODEL:");
        // Verify model prefix or full name is displayed cleanly
        expect(line2Plain).toMatch(/MODEL:\s+claud/);
        expect(TuiSanitizer.stripAnsi(lines[1]!).length).toBeLessThanOrEqual(w);
      }
    });

    it("verifies clean fallback without throwing when dimensions are missing or nullish", () => {
      expect(() => TerminalLayout.renderAntigravityHeader({})).not.toThrow();
      expect(() => TerminalLayout.renderAntigravityHeader("ONLINE")).not.toThrow();
      expect(() => TerminalLayout.renderAntigravityHeader({ width: 80 })).not.toThrow();
    });
  });

  // =========================================================================
  // SECTION 3: getPromptCursorCol Bounds, Monotonicity, and Scrolling
  // =========================================================================
  describe("Section 3: getPromptCursorCol Bounds, Monotonicity, and Scrolling", () => {
    it("returns column 1 for non-command mode across all widths and any cursorPosition", () => {
      for (const w of ALL_INTEGER_WIDTHS) {
        for (const pos of [-10, 0, 1, 5, 20, 100]) {
          expect(TerminalLayout.getPromptCursorCol(w, "some prompt", pos, false)).toBe(1);
        }
      }
    });

    it("guarantees 1 <= col <= width for ALL integer widths (10..250) and arbitrary inputs", () => {
      const testPrompts = [
        "",
        "/",
        "/help",
        "/models openrouter/anthropic/claude-3.5-sonnet",
        ":cmd",
        "a".repeat(10),
        "b".repeat(80),
        "c".repeat(250),
      ];

      const testPositions = [-5, 0, 1, 5, 10, 20, 50, 80, 100, 250, 500];

      for (const w of ALL_INTEGER_WIDTHS) {
        for (const prompt of testPrompts) {
          for (const pos of testPositions) {
            const col = TerminalLayout.getPromptCursorCol(w, prompt, pos, true);
            expect(col).toBeGreaterThanOrEqual(1);
            expect(col).toBeLessThanOrEqual(w);
          }
        }
      }
    });

    it("simulates character-by-character keystrokes and verifies monotonic advancement", () => {
      // Simulate user typing "/models" at width 80
      const typed = "/models";
      let prevCol = -1;
      for (let i = 0; i <= typed.length; i++) {
        const sub = typed.slice(0, i);
        const col = TerminalLayout.getPromptCursorCol(80, sub, i, true);

        expect(col).toBeGreaterThanOrEqual(1);
        expect(col).toBeLessThanOrEqual(80);

        if (i > 0) {
          expect(col).toBeGreaterThan(prevCol);
        }
        prevCol = col;
      }
    });

    it("simulates full slash command progression and verifies dynamic cursor tracking", () => {
      // Prompt "/models test" has length 12
      // At width 80, decorations for slash command:
      // prefix = " \x1b[38;2;0;242;254m❖ anantham:preview >\x1b[0m " -> visible length 22
      // Cursor at pos 0 should be at col 23 (visPrefixLen + 1)
      // Cursor at pos 12 should be at col 23 + 12 = 35
      for (let pos = 0; pos <= 12; pos++) {
        const col = TerminalLayout.getPromptCursorCol(80, "/models test", pos, true);
        expect(col).toBe(23 + pos);
      }
    });

    it("simulates horizontal scrolling with prompt longer than available width", () => {
      // At width 40, slash command isNarrow:
      // prefix = " [CMD] : " (9 cols), suffix = "_ | [↵] [ESC]" (13 cols)
      // avail = 40 - 9 - 13 = 18 cols
      const longPrompt = "/12345678901234567890"; // 21 chars

      // When cursor is at the end (pos 21):
      // sliceStart = 21 - (18 - 3) = 6
      // visiblePrompt = "..." + prompt.slice(6) -> "..." + 15 chars = 18 chars
      // Cursor at end is at: 9 + 18 + 1 = 28
      const colEnd = TerminalLayout.getPromptCursorCol(40, longPrompt, 21, true);
      expect(colEnd).toBe(28);
      expect(colEnd).toBeLessThanOrEqual(40);

      // When cursor is at sliceStart (pos 6):
      // visCursorPos = 3 + (6 - 6) = 3 -> col = 9 + 3 + 1 = 13
      const col6 = TerminalLayout.getPromptCursorCol(40, longPrompt, 6, true);
      expect(col6).toBe(13);

      // When cursor moves into hidden portion (pos 0):
      // Clamps to column 10 (first dot of ellipsis)
      const col0 = TerminalLayout.getPromptCursorCol(40, longPrompt, 0, true);
      expect(col0).toBe(10);
    });

    it("verifies ultra-narrow terminals (width < 25) keep cursor within bounds [1, width]", () => {
      for (const w of [10, 15, 20, 24]) {
        for (let pos = 0; pos <= 30; pos++) {
          const col = TerminalLayout.getPromptCursorCol(w, "/models", pos, true);
          expect(col).toBeGreaterThanOrEqual(1);
          expect(col).toBeLessThanOrEqual(w);
        }
      }
    });
  });

  // =========================================================================
  // SECTION 5: Cursor-to-Render Spatial Alignment Invariants
  // =========================================================================
  describe("Section 5: Cursor-to-Render Spatial Alignment Invariants", () => {
    it("guarantees getPromptCursorCol points within the visible prompt line bounds for all widths 10..250", () => {
      const prompts = [
        "",
        "/",
        "/m",
        "/models",
        "/models openrouter/anthropic/claude-3.5-sonnet",
        ":save",
        "a".repeat(50),
        "x".repeat(150),
      ];

      for (const w of ALL_INTEGER_WIDTHS) {
        for (const prompt of prompts) {
          const lines = TerminalLayout.renderPromptBar({
            width: w,
            commandPrompt: prompt,
            isCommandMode: true,
          });
          const promptLine = lines[1]!;
          const lineVisLen = TuiSanitizer.stripAnsi(promptLine).length;

          // Test cursor positions: 0, middle, end, beyond end
          const testPositions = [0, 1, Math.floor(prompt.length / 2), prompt.length, prompt.length + 10];
          for (const pos of testPositions) {
            const col = TerminalLayout.getPromptCursorCol(w, prompt, pos, true);

            // 1. Column must never exceed terminal width
            expect(col).toBeLessThanOrEqual(w);
            // 2. Column must never be less than 1
            expect(col).toBeGreaterThanOrEqual(1);
            // 3. Column must never point beyond the rendered line length + 1
            expect(col).toBeLessThanOrEqual(lineVisLen + 1);
          }
        }
      }
    });

    it("verifies cursor position moves monotonically forward during typing for all integer widths 10..250", () => {
      // 1. Non-slash command (:models) is strictly monotonic from empty prompt (i = 0)
      const nonSlash = ":models";
      for (const w of ALL_INTEGER_WIDTHS) {
        let prevCol = -1;
        for (let i = 0; i <= nonSlash.length; i++) {
          const partial = nonSlash.slice(0, i);
          const col = TerminalLayout.getPromptCursorCol(w, partial, i, true);

          expect(col).toBeGreaterThanOrEqual(1);
          expect(col).toBeLessThanOrEqual(w);

          if (i > 0) {
            expect(col).toBeGreaterThanOrEqual(prevCol);
          }
          prevCol = col;
        }
      }

      // 2. Slash command (/models) is strictly monotonic for all characters typed (i >= 1)
      const slashText = "/models";
      for (const w of ALL_INTEGER_WIDTHS) {
        let prevCol = -1;
        for (let i = 1; i <= slashText.length; i++) {
          const partial = slashText.slice(0, i);
          const col = TerminalLayout.getPromptCursorCol(w, partial, i, true);

          expect(col).toBeGreaterThanOrEqual(1);
          expect(col).toBeLessThanOrEqual(w);

          if (i > 1) {
            expect(col).toBeGreaterThanOrEqual(prevCol);
          }
          prevCol = col;
        }
      }
    });
  });

  // =========================================================================
  // SECTION 6: Extreme Adversarial Escapes and Incomplete Sequences
  // =========================================================================
  describe("Section 6: Extreme Adversarial Escapes and Corrupted Payloads", () => {
    const TOXIC_PAYLOADS = [
      "\x1b[38;2;255;0;0mBrokenRGB",
      "\x1b[38;5;196m256Color",
      "\x1b]8;;https://malicious.domain\x07ClickHere\x1b]8;;\x07",
      "\x1b[2J\x1b[HInjectedClearScreen",
      "\x1b[?1049h\x1b[?25hBufferFlip",
      "Line1\nLine2\r\nLine3",
      "\0\x01\x02\x03\x04\x05\x06\x07\x08\x0b\x0c\x0e\x0f",
      "👨‍👩‍👧‍👦 Family Emoji ZWJ",
      "🇺🇸 Flag Emoji Pair",
      "مرحبا بالعالم (RTL Arabic)",
      "Mixed English and العربية with 12345",
      "A".repeat(5000),
    ];

    it("renderPromptBar handles all toxic payloads across all widths without overflowing", () => {
      for (const payload of TOXIC_PAYLOADS) {
        for (const w of CRITICAL_EDGE_WIDTHS) {
          const lines = TerminalLayout.renderPromptBar({
            width: w,
            commandPrompt: payload,
            isCommandMode: true,
          });

          for (const line of lines) {
            const vis = TuiSanitizer.stripAnsi(line).length;
            expect(vis).toBeLessThanOrEqual(w);
          }
        }
      }
    });

    it("renderAntigravityHeader handles all toxic payloads as model and project without overflowing", () => {
      for (const payload of TOXIC_PAYLOADS) {
        for (const w of CRITICAL_EDGE_WIDTHS) {
          const lines = TerminalLayout.renderAntigravityHeader({
            width: w,
            activeModel: payload,
            projectId: payload.slice(0, 50),
            status: payload.slice(0, 20),
          });

          for (const line of lines) {
            const vis = TuiSanitizer.stripAnsi(line).length;
            expect(vis).toBeLessThanOrEqual(w);
          }
        }
      }
    });

    it("getPromptCursorCol handles toxic payloads across all widths without NaN, null, or out-of-bounds", () => {
      for (const payload of TOXIC_PAYLOADS) {
        for (const w of CRITICAL_EDGE_WIDTHS) {
          for (const pos of [-10, 0, 5, 20, 100, 5000]) {
            const col = TerminalLayout.getPromptCursorCol(w, payload, pos, true);
            expect(Number.isInteger(col)).toBe(true);
            expect(col).toBeGreaterThanOrEqual(1);
            expect(col).toBeLessThanOrEqual(w);
          }
        }
      }
    });
  });

  // =========================================================================
  // SECTION 7: Extended Widths (Outside 10..250 Boundary Stress)
  // =========================================================================
  describe("Section 7: Extended Widths (Extreme Viewports < 10 and > 250)", () => {
    it("handles ultra-wide terminals (width = 300, 500, 1000) cleanly", () => {
      for (const w of [300, 500, 1000]) {
        const header = TerminalLayout.renderAntigravityHeader({ width: w, activeModel: "claude-3.5-sonnet" });
        for (const l of header) {
          expect(TuiSanitizer.stripAnsi(l).length).toBeLessThanOrEqual(w);
        }

        const prompt = TerminalLayout.renderPromptBar({ width: w, commandPrompt: "/models", isCommandMode: true });
        for (const l of prompt) {
          expect(TuiSanitizer.stripAnsi(l).length).toBeLessThanOrEqual(w);
        }

        const col = TerminalLayout.getPromptCursorCol(w, "/models", 5, true);
        expect(col).toBeGreaterThanOrEqual(1);
        expect(col).toBeLessThanOrEqual(w);
      }
    });

    it("handles degenerate narrow terminals (width = 1, 5, 9) without throwing", () => {
      for (const w of [1, 5, 9]) {
        expect(() => {
          TerminalLayout.renderAntigravityHeader({ width: w });
          TerminalLayout.renderPromptBar({ width: w, commandPrompt: "/models", isCommandMode: true });
          TerminalLayout.getPromptCursorCol(w, "/models", 5, true);
        }).not.toThrow();
      }
    });
  });
});
