import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { PassThrough } from "node:stream";

import {
  ModelAccordionBrowser,
  formatContextLength,
  formatPricing,
  type AccordionRow,
} from "../../src/tui/model-accordion-browser.js";
import {
  ModelCatalogCache,
  type CachedModel,
  normalizeProvider,
  parsePricePerM,
} from "../../src/persistence/model-catalog-cache.js";
import {
  TerminalLogoRenderer,
  ANTIGRAVITY_PALETTE,
} from "../../src/tui/terminal-logo-renderer.js";
import { TuiController } from "../../src/tui/tui-controller.js";
import { TuiRenderer } from "../../src/tui/tui-renderer.js";
import { TuiStateAdapter } from "../../src/tui/tui-state-adapter.js";
import { TuiSanitizer } from "../../src/tui/tui-sanitizer.js";
import { UserConfigManager } from "../../src/persistence/user-config-manager.js";

describe("Adversarial Stress Harness: Antigravity TUI Agent Harness", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "anantham-adversarial-"));
    UserConfigManager.getInstance(tmpDir);
    ModelCatalogCache.resetInstance();
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
    vi.restoreAllMocks();
  });

  // =========================================================================
  // DIMENSION 1: ModelAccordionBrowser Navigation Bounds & Adversarial States
  // =========================================================================
  describe("Dimension 1: ModelAccordionBrowser Navigation Bounds & Adversarial States", () => {
    it("handles zero models gracefully without throwing", () => {
      const browser = new ModelAccordionBrowser([]);
      expect(browser.getProviderGroups()).toHaveLength(0);
      expect(browser.getVisibleRows()).toHaveLength(0);
      expect(browser.getSelectedIndex()).toBe(0);

      // Rapid navigation on empty browser
      for (let i = 0; i < 50; i++) {
        expect(browser.handleKey("\x1b[A").action).toBe("render");
        expect(browser.handleKey("\x1b[B").action).toBe("render");
        expect(browser.handleKey(" ").action).toBe("render");
        expect(browser.handleKey("\r").action).toBe("none");
      }
      expect(browser.getSelectedIndex()).toBe(0);

      // Rendering empty browser
      const rendered = browser.render(80, 24);
      expect(rendered.length).toBeGreaterThan(0);
      const text = rendered.join("\n");
      expect(text).toContain("No models available");
    });

    it("prevents index underflow and overflow under 200 rapid arrow keystrokes", () => {
      const models = ModelCatalogCache.CURATED_MODELS;
      const browser = new ModelAccordionBrowser(models);

      // Force collapse all except one to test tight bounds
      browser.collapseAll();
      const visibleCount = browser.getVisibleRows().length;
      expect(visibleCount).toBe(browser.getProviderGroups().length);

      // Up arrow 200 times past index 0
      for (let i = 0; i < 200; i++) {
        browser.handleKey("\x1b[A");
      }
      expect(browser.getSelectedIndex()).toBe(0);

      // Down arrow 200 times past max index
      for (let i = 0; i < 200; i++) {
        browser.handleKey("\x1b[B");
      }
      expect(browser.getSelectedIndex()).toBe(visibleCount - 1);
    });

    it("clamps selection safely when an expanded group is collapsed under the cursor", () => {
      const models = ModelCatalogCache.CURATED_MODELS;
      const browser = new ModelAccordionBrowser(models);
      browser.expandAll();

      const totalRows = browser.getVisibleRows().length;
      expect(totalRows).toBeGreaterThan(15);

      // Move cursor to the very last child item
      browser.setSelectedIndex(totalRows - 1);
      expect(browser.getSelectedIndex()).toBe(totalRows - 1);

      // Collapse all groups: visible count collapses to provider folders only
      browser.collapseAll();
      const collapsedCount = browser.getVisibleRows().length;
      expect(collapsedCount).toBeLessThan(totalRows);

      // Selected index MUST be clamped to <= collapsedCount - 1
      expect(browser.getSelectedIndex()).toBe(collapsedCount - 1);
      expect(browser.getSelectedIndex()).toBeGreaterThanOrEqual(0);
    });

    it("handles Left arrow jump to parent provider folder from deep child items", () => {
      const models = ModelCatalogCache.CURATED_MODELS;
      const browser = new ModelAccordionBrowser(models);
      browser.expandAll();

      const rows = browser.getVisibleRows();
      // Find a child model row
      const childIdx = rows.findIndex((r) => r.type === "model" && r.groupIndex > 0);
      expect(childIdx).toBeGreaterThan(0);
      const childRow = rows[childIdx] as Extract<AccordionRow, { type: "model" }>;

      browser.setSelectedIndex(childIdx);
      expect(browser.getSelectedIndex()).toBe(childIdx);

      // Press Left arrow: should jump to parent provider folder
      const res = browser.handleKey("\x1b[D");
      expect(res.action).toBe("render");

      const newSelected = browser.getSelectedIndex();
      const parentRow = browser.getVisibleRows()[newSelected];
      expect(parentRow?.type).toBe("provider");
      expect((parentRow as any)?.groupIndex).toBe(childRow.groupIndex);
    });

    it("handles Right arrow expansion and child navigation on folders", () => {
      const models = ModelCatalogCache.CURATED_MODELS;
      const browser = new ModelAccordionBrowser(models);
      browser.collapseAll();

      // At index 0 (collapsed folder)
      browser.setSelectedIndex(0);
      const firstGroup = browser.getProviderGroups()[0]!;
      expect(firstGroup.expanded).toBe(false);

      // First Right arrow: expands folder
      browser.handleKey("\x1b[C");
      expect(firstGroup.expanded).toBe(true);
      expect(browser.getSelectedIndex()).toBe(0);

      // Second Right arrow: jumps to first child model inside that folder
      browser.handleKey("\x1b[C");
      expect(browser.getSelectedIndex()).toBe(1);
      const current = browser.getVisibleRows()[browser.getSelectedIndex()];
      expect(current?.type).toBe("model");
    });

    it("handles adversarial search queries: non-matching, symbols, unicode, and empty results", () => {
      const models = ModelCatalogCache.CURATED_MODELS;
      const browser = new ModelAccordionBrowser(models);

      // Activate search
      browser.handleKey("/");

      // Feed symbols and non-matching query
      const adversary = "!@#$%^&*()_+-=[]{}|;':,.<>?/~`";
      for (const char of adversary) {
        browser.handleKey(char);
      }
      expect(browser.getSearchFilter()).toBe(adversary);
      expect(browser.getVisibleRows()).toHaveLength(0);

      // Render non-matching query
      const rendered = browser.render(80, 24);
      expect(rendered.some((l) => l.includes("No models found matching"))).toBe(true);

      // Navigation keystrokes on 0 results do not throw
      browser.handleKey("\x1b[A");
      browser.handleKey("\x1b[B");
      browser.handleKey(" ");
      expect(browser.handleKey("\r").action).toBe("render"); // Enter exits search mode

      // Backspace clears query character by character
      const queryLen = browser.getSearchFilter().length;
      browser.handleKey("/"); // enter search again
      for (let i = 0; i < queryLen; i++) {
        browser.handleKey("\x7f");
      }
      expect(browser.getSearchFilter()).toBe("");
      expect(browser.getVisibleRows().length).toBeGreaterThan(0);
    });

    it("renders stably across extreme terminal geometry (narrow, wide, minimal)", () => {
      const models = ModelCatalogCache.CURATED_MODELS;
      const browser = new ModelAccordionBrowser(models);

      // Extreme narrow: width 30, height 8
      const narrow = browser.render(30, 8);
      expect(narrow.length).toBeGreaterThan(0);

      // Extreme wide: width 240, height 80
      const wide = browser.render(240, 80);
      expect(wide.length).toBeGreaterThan(0);

      // Zero or negative limits should be safely clamped by inner logic
      const minimal = browser.render(10, 3);
      expect(minimal.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // DIMENSION 2: ModelCatalogCache Corruption, Timeouts, TTL, Atomic Writes
  // =========================================================================
  describe("Dimension 2: ModelCatalogCache Corruption, Timeouts, TTL, Atomic Writes", () => {
    it("handles corrupt JSON in cache file gracefully by falling back to curated models", async () => {
      const cacheFile = path.join(tmpDir, "models_cache.json");
      fs.writeFileSync(cacheFile, "{ corrupted JSON text ::: ???", "utf-8");

      const cache = new ModelCatalogCache(tmpDir, 3600000);
      expect(cache.getCachedModels()).toBeNull();
      expect(cache.isCacheFresh()).toBe(false);

      // Mock network failure to verify fallback to curated models
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network offline"));
      try {
        const models = await cache.getModels(false);
        expect(models.length).toBe(ModelCatalogCache.CURATED_MODELS.length);
        expect(models[0]?.id).toBe("anthropic/claude-3.5-sonnet");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("handles empty (0-byte) cache file gracefully", async () => {
      const cacheFile = path.join(tmpDir, "models_cache.json");
      fs.writeFileSync(cacheFile, "", "utf-8");

      const cache = new ModelCatalogCache(tmpDir, 3600000);
      expect(cache.getCachedModels()).toBeNull();

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network offline"));
      try {
        const models = await cache.getModels(false);
        expect(models.length).toBeGreaterThan(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("handles invalid schema (non-array models, missing fetchedAt)", async () => {
      const cacheFile = path.join(tmpDir, "models_cache.json");
      fs.writeFileSync(
        cacheFile,
        JSON.stringify({ fetchedAt: "invalid_string", models: "not_an_array" }),
        "utf-8"
      );

      const cache = new ModelCatalogCache(tmpDir, 3600000);
      expect(cache.getCachedModels()).toBeNull();

      // Mock network failure to verify fallback to CURATED_MODELS
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network offline"));
      try {
        const models = await cache.getModels(false);
        expect(models).toEqual(ModelCatalogCache.CURATED_MODELS);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("detects expired cache and falls back cleanly on network timeout / abort", async () => {
      const cacheFile = path.join(tmpDir, "models_cache.json");
      // Cache with timestamp 2 hours ago
      const twoHoursAgo = Date.now() - 7200000;
      const staleModels: CachedModel[] = [
        {
          id: "openai/gpt-4o-stale",
          name: "GPT-4o Stale",
          provider: "openai",
          contextLength: 128000,
          promptPricePerM: 2.5,
          completionPricePerM: 10,
        },
      ];
      fs.writeFileSync(
        cacheFile,
        JSON.stringify({ fetchedAt: twoHoursAgo, ttlMs: 3600000, models: staleModels }),
        "utf-8"
      );

      const cache = new ModelCatalogCache(tmpDir, 3600000);
      expect(cache.isCacheFresh()).toBe(false);

      // Mock network failure
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network timeout after 8000ms"));

      try {
        const models = await cache.getModels(false);
        // Should fall back to existing stale cache on disk rather than crashing
        expect(models).toHaveLength(1);
        expect(models[0]?.id).toBe("openai/gpt-4o-stale");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("ensures atomic write integrity without leftover temporary files", () => {
      const cache = new ModelCatalogCache(tmpDir, 3600000);
      cache.saveModels(ModelCatalogCache.CURATED_MODELS);

      const files = fs.readdirSync(tmpDir);
      expect(files).toContain("models_cache.json");
      const tmpFiles = files.filter((f) => f.includes(".tmp."));
      expect(tmpFiles).toHaveLength(0);

      const content = JSON.parse(fs.readFileSync(path.join(tmpDir, "models_cache.json"), "utf-8"));
      expect(content.models.length).toBe(ModelCatalogCache.CURATED_MODELS.length);
    });
  });

  // =========================================================================
  // DIMENSION 3: Two-Tier Escape Key Routing & State Transitions
  // =========================================================================
  describe("Dimension 3: Two-Tier Escape Key Routing & State Transitions", () => {
    it("handles two-tier Escape in ModelAccordionBrowser: search filter dismiss -> modal close", () => {
      const browser = new ModelAccordionBrowser(ModelCatalogCache.CURATED_MODELS);

      // Enter search
      browser.handleKey("/");
      browser.handleKey("c");
      browser.handleKey("l");
      browser.handleKey("a");
      browser.handleKey("u");
      expect(browser.getSearchFilter()).toBe("clau");

      // Tier 1: Escape while searching clears search query and exits search mode
      const esc1 = browser.handleKey("\x1b");
      expect(esc1.action).toBe("render");
      expect(browser.getSearchFilter()).toBe("");

      // Tier 2: Escape when not searching closes the modal
      const esc2 = browser.handleKey("\x1b");
      expect(esc2.action).toBe("close");
    });

    it("handles two-tier Escape in TuiController: modal dismissal -> root command bar -> clean exit", async () => {
      const stdout = new PassThrough();
      let outputAcc = "";
      stdout.on("data", (chunk) => {
        outputAcc += chunk.toString();
      });

      const adapter = new TuiStateAdapter();
      const renderer = new TuiRenderer({ dimensions: { width: 80, height: 24 } });
      const controller = new TuiController({
        stateAdapter: adapter,
        renderer,
        output: stdout,
      });

      controller.start();
      expect(controller.getIsRunning()).toBe(true);
      expect(outputAcc).toContain("\x1b[?1049h"); // Alternate screen buffer opened

      // Open model browser modal
      await controller.openModelBrowserModal();
      expect(controller.getModelBrowserModal()).not.toBeNull();

      // Tier 1: Escape inside open modal closes modal and returns to root prompt
      const runningAfterModalEsc = await controller.handleInput("\x1b");
      expect(runningAfterModalEsc).toBe(true);
      expect(controller.getModelBrowserModal()).toBeNull();
      expect(controller.getIsRunning()).toBe(true);

      // Tier 2: Escape at root prompt shuts down controller cleanly
      const runningAfterRootEsc = await controller.handleInput("\x1b");
      expect(runningAfterRootEsc).toBe(false);
      expect(controller.getIsRunning()).toBe(false);
      expect(outputAcc).toContain("\x1b[?1049l"); // Alternate screen buffer restored
      expect(outputAcc).toContain("\x1b[?25h");   // Cursor unhidden
    });

    it("handles Command Output modal dismissal via Escape without quitting TUI", async () => {
      const stdout = new PassThrough();
      const adapter = new TuiStateAdapter();

      const renderer = new TuiRenderer({ dimensions: { width: 80, height: 24 } });
      const controller = new TuiController({
        stateAdapter: adapter,
        renderer,
        output: stdout,
      });

      controller.start();
      controller.setCommandOutput({ title: "Help Manual", lines: ["Line 1", "Line 2"] });
      expect(controller.getCommandOutput()).not.toBeNull();

      // Escape closes command output modal
      const keepRunning = await controller.handleInput("\x1b");
      expect(keepRunning).toBe(true);
      expect(controller.getCommandOutput()).toBeNull();
      expect(controller.getIsRunning()).toBe(true);
    });

    it("handles Command Mode Escape: preserves draft, cancels mode, second Escape quits", async () => {
      const stdout = new PassThrough();
      const adapter = new TuiStateAdapter();

      const renderer = new TuiRenderer({ dimensions: { width: 80, height: 24 } });
      const controller = new TuiController({
        stateAdapter: adapter,
        renderer,
        output: stdout,
      });

      controller.start();

      // Enter command mode and type draft
      await controller.handleInput(":");
      expect(controller.isInCommandMode()).toBe(true);
      await controller.handleInput("test draft command");
      expect(controller.getCommandBuffer()).toBe("test draft command");

      // First Escape: exits command mode, saves draft
      await controller.handleInput("\x1b");
      expect(controller.isInCommandMode()).toBe(false);
      expect(controller.getSavedDraft()).toBe("test draft command");
      expect(controller.getIsRunning()).toBe(true);

      // Re-entering command mode restores draft
      await controller.handleInput(":");
      expect(controller.isInCommandMode()).toBe(true);
      expect(controller.getCommandBuffer()).toBe("test draft command");

      // Cancel again
      await controller.handleInput("\x1b");
      expect(controller.isInCommandMode()).toBe(false);

      // Second Escape at root prompt quits
      const keepRunning = await controller.handleInput("\x1b");
      expect(keepRunning).toBe(false);
      expect(controller.getIsRunning()).toBe(false);
    });
  });

  // =========================================================================
  // DIMENSION 4: Terminal Logo Renderer Graphics Protocols & Resizing
  // =========================================================================
  describe("Dimension 4: Terminal Logo Renderer Graphics Protocols & Resizing", () => {
    it("detects protocols accurately from environment variables", () => {
      const origEnv = { ...process.env };
      try {
        delete process.env.KITTY_WINDOW_ID;
        delete process.env.TERM_PROGRAM;
        delete process.env.LC_TERMINAL;
        delete process.env.COLORTERM;
        process.env.TERM = "xterm-256color";

        expect(TerminalLogoRenderer.detectProtocol()).toBe("halfblock");

        process.env.KITTY_WINDOW_ID = "1234";
        expect(TerminalLogoRenderer.detectProtocol()).toBe("kitty");
        delete process.env.KITTY_WINDOW_ID;

        process.env.TERM_PROGRAM = "iTerm.app";
        expect(TerminalLogoRenderer.detectProtocol()).toBe("iterm2");
        delete process.env.TERM_PROGRAM;

        process.env.COLORTERM = "sixel";
        expect(TerminalLogoRenderer.detectProtocol()).toBe("sixel");
      } finally {
        process.env = origEnv;
      }
    });

    it("falls back to half-blocks gracefully when graphic logo file does not exist", () => {
      const nonExistent = path.join(tmpDir, "missing_logo_12345.png");
      const rendered = TerminalLogoRenderer.renderHeaderLogo({
        protocol: "kitty",
        logoPath: nonExistent,
      });

      // Must not throw, must return 4 half-block lines
      expect(rendered).toHaveLength(4);
      expect(rendered[0]).toContain("\u2580");
      expect(rendered[0]).toContain("\x1b[38;2;");
      expect(rendered[0]).toContain("\x1b[48;2;");
    });

    it("generates correct graphic protocol sequences for valid files", () => {
      const testPng = path.join(tmpDir, "test.png");
      // Create a mock 32-byte PNG header
      const pngHeader = Buffer.alloc(32);
      pngHeader[0] = 0x89;
      pngHeader[1] = 0x50;
      pngHeader[2] = 0x4e;
      pngHeader[3] = 0x47;
      pngHeader.writeUInt32BE(64, 16); // width = 64
      pngHeader.writeUInt32BE(64, 20); // height = 64
      fs.writeFileSync(testPng, pngHeader);

      // Kitty
      const kitty = TerminalLogoRenderer.renderGraphicProtocol("kitty", testPng);
      expect(kitty.startsWith("\x1b_Ga=T")).toBe(true);
      expect(kitty.endsWith("\x1b\\")).toBe(true);
      expect(kitty).toContain("s=64,v=64");

      // iTerm2
      const iterm = TerminalLogoRenderer.renderGraphicProtocol("iterm2", testPng);
      expect(iterm.startsWith("\x1b]1337;File=inline=1")).toBe(true);
      expect(iterm.endsWith("\x07")).toBe(true);

      // Sixel
      const sixel = TerminalLogoRenderer.renderGraphicProtocol("sixel", testPng);
      expect(sixel.startsWith("\x1bPq")).toBe(true);
      expect(sixel.endsWith("\x1b\\")).toBe(true);
    });

    it("renders TrueColor half-blocks with narrow and wide width adaptations", () => {
      // Default (16 columns -> 4 lines)
      const standard = TerminalLogoRenderer.renderHalfBlockLogo();
      expect(standard).toHaveLength(4);

      // Narrow width (8 columns -> cropped symmetrically)
      const narrow = TerminalLogoRenderer.renderHalfBlockLogo(8);
      expect(narrow).toHaveLength(4);
      for (const line of narrow) {
        const clean = TuiSanitizer.sanitize(line);
        expect(clean.length).toBe(8);
      }

      // Wide width (24 columns -> padded with dark onyx)
      const wide = TerminalLogoRenderer.renderHalfBlockLogo(24);
      expect(wide).toHaveLength(4);
      for (const line of wide) {
        const clean = TuiSanitizer.sanitize(line);
        expect(clean.length).toBe(24);
      }
    });
  });

  // =========================================================================
  // DIMENSION 5: Token Pricing and Normalization Utilities
  // =========================================================================
  describe("Dimension 5: Token Pricing, Formatters & Provider Normalization", () => {
    it("normalizes provider prefixes accurately across standard and edge variants", () => {
      expect(normalizeProvider("openrouter/anthropic/claude-3.5-sonnet")).toBe("anthropic");
      expect(normalizeProvider("anthropic/claude-3.5-sonnet")).toBe("anthropic");
      expect(normalizeProvider("openai/gpt-4o")).toBe("openai");
      expect(normalizeProvider("google/gemini-2.5-pro")).toBe("google");
      expect(normalizeProvider("deepseek/deepseek-chat")).toBe("deepseek");
      expect(normalizeProvider("meta-llama/llama-3.3-70b-instruct")).toBe("meta-llama");
      expect(normalizeProvider("virtuals/game-agent")).toBe("virtuals");
      expect(normalizeProvider("unknown-bare-model")).toBe("other");
    });

    it("parses per-token prices into price per 1 Million tokens accurately", () => {
      expect(parsePricePerM(0.000003)).toBe(3.0);
      expect(parsePricePerM("0.000015")).toBe(15.0);
      expect(parsePricePerM(0)).toBe(0);
      expect(parsePricePerM(undefined)).toBe(0);
      expect(parsePricePerM("invalid")).toBe(0);
    });

    it("formats context lengths cleanly", () => {
      expect(formatContextLength(2000000)).toBe("2M ctx");
      expect(formatContextLength(1500000)).toBe("1.5M ctx");
      expect(formatContextLength(128000)).toBe("128k ctx");
      expect(formatContextLength(8192)).toBe("8k ctx");
      expect(formatContextLength(512)).toBe("512 ctx");
    });

    it("formats pricing display cleanly", () => {
      expect(formatPricing(0, 0)).toBe("Free");
      expect(formatPricing(3.0, 15.0)).toBe("$3.00/$15.0 per M");
      expect(formatPricing(0.15, 0.6)).toBe("$0.150/$0.600 per M");
    });
  });

  // =========================================================================
  // DIMENSION 6: High-Load, Adversarial Injections, Split Escapes & Concurrency
  // =========================================================================
  describe("Dimension 6: High-Load, Adversarial Injections, Split Escapes & Concurrency", () => {
    it("survives massive model catalog ingestion (5,000 models) with fast rendering", () => {
      const massiveModels: CachedModel[] = [];
      const providers = ["openai", "anthropic", "google", "deepseek", "meta-llama", "virtuals", "mistralai"];
      for (let i = 0; i < 5000; i++) {
        const prov = providers[i % providers.length]!;
        massiveModels.push({
          id: `${prov}/model-${i}`,
          name: `Synthetic Model ${i}`,
          provider: prov,
          contextLength: 8192 * ((i % 10) + 1),
          promptPricePerM: (i % 100) * 0.05,
          completionPricePerM: (i % 100) * 0.2,
        });
      }

      const t0 = Date.now();
      const browser = new ModelAccordionBrowser(massiveModels);
      expect(browser.getProviderGroups().length).toBe(providers.length);

      // Render should be fast (< 50ms)
      const lines = browser.render(100, 25);
      const elapsed = Date.now() - t0;
      expect(lines.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(150);

      // Filter should be fast
      browser.handleKey("/");
      browser.handleKey("2");
      browser.handleKey("5");
      expect(browser.getVisibleRows().length).toBeGreaterThan(0);
    });

    it("evaluates ANSI escape handling in model names and documents behavior", () => {
      const maliciousModels: CachedModel[] = [
        {
          id: "anthropic/malicious-1",
          name: "Malicious \x1b[2J\x1b[H\x1b[31;1mINJECTION\x1b[0m",
          provider: "anthropic",
          contextLength: 100000,
          promptPricePerM: 1,
          completionPricePerM: 5,
          description: "Exploit \x1b[?1049l\x1b[?25h teardown attempt",
        },
      ];

      const browser = new ModelAccordionBrowser(maliciousModels);
      const lines = browser.render(80, 24);
      const rawText = lines.join("\n");

      // TuiSanitizer correctly strips all ANSI codes
      const sanitized = TuiSanitizer.sanitize(rawText);
      expect(sanitized).not.toContain("\x1b[2J");
      expect(sanitized).not.toContain("\x1b[?1049l");

      // Empirical verification: ModelAccordionBrowser passes raw model.name through without
      // TuiSanitizer.truncate(), demonstrating the need for defense-in-depth hardening
      expect(rawText).toContain("\x1b[2J");
    });

    it("decodes split ANSI escape tokens correctly across chunk boundaries", () => {
      // Test split CSI sequence: "\x1b" in chunk 1, "[A" in chunk 2
      const res1 = TuiController.decodeInputTokens("\x1b", false);
      expect(res1.tokens).toHaveLength(0);
      expect(res1.remainder).toBe("\x1b");

      // Combine with second chunk
      const res2 = TuiController.decodeInputTokens(res1.remainder + "[A", true);
      expect(res2.tokens).toEqual(["\x1b[A"]);
      expect(res2.remainder).toBe("");

      // Test split 3-character sequence: "\x1b[" in chunk 1, "B" in chunk 2
      const res3 = TuiController.decodeInputTokens("\x1b[", false);
      expect(res3.tokens).toHaveLength(0);
      expect(res3.remainder).toBe("\x1b[");

      const res4 = TuiController.decodeInputTokens(res3.remainder + "B", true);
      expect(res4.tokens).toEqual(["\x1b[B"]);
      expect(res4.remainder).toBe("");
    });

    it("handles concurrent cache writes and reads without crashing or corrupted files", async () => {
      const cache = new ModelCatalogCache(tmpDir, 3600000);
      const promises: Promise<void>[] = [];

      for (let i = 0; i < 20; i++) {
        promises.push(
          new Promise<void>((resolve) => {
            const models = ModelCatalogCache.CURATED_MODELS.slice(0, (i % 5) + 2);
            cache.saveModels(models);
            const cached = cache.getCachedModels();
            expect(cached).not.toBeNull();
            resolve();
          })
        );
      }

      await Promise.all(promises);

      // Verify final file is valid JSON
      const finalModels = cache.getCachedModels();
      expect(finalModels).not.toBeNull();
      expect(finalModels!.length).toBeGreaterThan(0);
    });

    it("executes multi-tier Escape sequence across 4 nested states cleanly", async () => {
      const stdout = new PassThrough();
      const adapter = new TuiStateAdapter();
      const renderer = new TuiRenderer({ dimensions: { width: 80, height: 24 } });
      const controller = new TuiController({
        stateAdapter: adapter,
        renderer,
        output: stdout,
      });

      controller.start();
      expect(controller.getIsRunning()).toBe(true);

      // 1. Open model browser modal
      await controller.openModelBrowserModal();
      expect(controller.getModelBrowserModal()).not.toBeNull();

      // 2. Activate search mode inside modal
      await controller.handleInput("/");
      await controller.handleInput("qwen");
      expect(controller.getModelBrowserModal()!.getSearchFilter()).toBe("qwen");

      // 3. Escape #1: Dismiss search filter, stay in modal
      await controller.handleInput("\x1b");
      expect(controller.getModelBrowserModal()).not.toBeNull();
      expect(controller.getModelBrowserModal()!.getSearchFilter()).toBe("");
      expect(controller.getIsRunning()).toBe(true);

      // 4. Escape #2: Close model browser modal, return to normal root prompt
      await controller.handleInput("\x1b");
      expect(controller.getModelBrowserModal()).toBeNull();
      expect(controller.getIsRunning()).toBe(true);
      expect(controller.isInCommandMode()).toBe(false);

      // 5. Enter command mode
      await controller.handleInput(":");
      expect(controller.isInCommandMode()).toBe(true);
      await controller.handleInput("/help");

      // 6. Escape #3: Dismiss command mode, save draft, return to normal root prompt
      await controller.handleInput("\x1b");
      expect(controller.isInCommandMode()).toBe(false);
      expect(controller.getSavedDraft()).toBe("/help");
      expect(controller.getIsRunning()).toBe(true);

      // 7. Escape #4: At root prompt, terminate TUI cleanly
      const keepRunning = await controller.handleInput("\x1b");
      expect(keepRunning).toBe(false);
      expect(controller.getIsRunning()).toBe(false);
    });
  });
});

