import { describe, it, expect, beforeEach } from "vitest";
import {
  ModelAccordionBrowser,
  formatContextLength,
  formatPricing,
} from "../../src/tui/model-accordion-browser.js";
import { type CachedModel } from "../../src/persistence/model-catalog-cache.js";
import { TuiSanitizer } from "../../src/tui/tui-sanitizer.js";

describe("ModelAccordionBrowser", () => {
  const sampleModels: CachedModel[] = [
    {
      id: "anthropic/claude-3.5-sonnet",
      name: "Claude 3.5 Sonnet",
      provider: "anthropic",
      contextLength: 200000,
      promptPricePerM: 3.0,
      completionPricePerM: 15.0,
      description: "Leading Anthropic model",
    },
    {
      id: "anthropic/claude-3.5-haiku",
      name: "Claude 3.5 Haiku",
      provider: "anthropic",
      contextLength: 200000,
      promptPricePerM: 0.8,
      completionPricePerM: 4.0,
      description: "Fast Anthropic model",
    },
    {
      id: "openai/gpt-4o",
      name: "GPT-4o",
      provider: "openai",
      contextLength: 128000,
      promptPricePerM: 2.5,
      completionPricePerM: 10.0,
      description: "OpenAI flagship",
    },
    {
      id: "google/gemini-2.5-pro",
      name: "Gemini 2.5 Pro",
      provider: "google",
      contextLength: 1000000,
      promptPricePerM: 1.25,
      completionPricePerM: 5.0,
      description: "1M context window",
    },
    {
      id: "deepseek/deepseek-r1",
      name: "DeepSeek R1",
      provider: "deepseek",
      contextLength: 64000,
      promptPricePerM: 0.55,
      completionPricePerM: 2.19,
      description: "Reasoning specialist",
    },
  ];

  describe("formatContextLength", () => {
    it("formats thousands and millions accurately", () => {
      expect(formatContextLength(128000)).toBe("128k ctx");
      expect(formatContextLength(200000)).toBe("200k ctx");
      expect(formatContextLength(1000000)).toBe("1M ctx");
      expect(formatContextLength(2000000)).toBe("2M ctx");
      expect(formatContextLength(1500000)).toBe("1.5M ctx");
      expect(formatContextLength(4096)).toBe("4k ctx");
      expect(formatContextLength(512)).toBe("512 ctx");
    });
  });

  describe("formatPricing", () => {
    it("formats zero pricing as Free", () => {
      expect(formatPricing(0, 0)).toBe("Free");
    });

    it("formats non-zero prompt and completion rates per million", () => {
      expect(formatPricing(3.0, 15.0)).toBe("$3.00/$15.0 per M");
      expect(formatPricing(0.8, 4.0)).toBe("$0.800/$4.00 per M");
      expect(formatPricing(0.55, 2.19)).toBe("$0.550/$2.19 per M");
    });
  });

  describe("Provider Grouping and Partitioning", () => {
    it("groups models by provider in canonical order", () => {
      const browser = new ModelAccordionBrowser(sampleModels);
      const groups = browser.getProviderGroups();

      expect(groups.length).toBe(4);
      expect(groups[0]?.provider).toBe("anthropic");
      expect(groups[1]?.provider).toBe("openai");
      expect(groups[2]?.provider).toBe("google");
      expect(groups[3]?.provider).toBe("deepseek");

      expect(groups[0]?.models).toHaveLength(2);
      expect(groups[1]?.models).toHaveLength(1);
    });

    it("expands the active model group and focuses active model", () => {
      const browser = new ModelAccordionBrowser(sampleModels, "openai/gpt-4o");
      expect(browser.getActiveModel()).toBe("openai/gpt-4o");

      const groups = browser.getProviderGroups();
      const openaiGroup = groups.find((g) => g.provider === "openai");
      expect(openaiGroup?.expanded).toBe(true);

      const visible = browser.getVisibleRows();
      const selected = visible[browser.getSelectedIndex()];
      expect(selected?.type).toBe("model");
      if (selected?.type === "model") {
        expect(selected.model.id).toBe("openai/gpt-4o");
      }
    });

    it("updates active model via setActiveModel", () => {
      const browser = new ModelAccordionBrowser(sampleModels);
      browser.setActiveModel("deepseek/deepseek-r1");
      expect(browser.getActiveModel()).toBe("deepseek/deepseek-r1");
    });
  });

  describe("Keyboard Navigation & Bounds", () => {
    let browser: ModelAccordionBrowser;

    beforeEach(() => {
      browser = new ModelAccordionBrowser(sampleModels, "anthropic/claude-3.5-sonnet");
      browser.expandAll();
    });

    it("navigates down and up with arrow keys and vi keys", () => {
      browser.setSelectedIndex(0);
      expect(browser.getSelectedIndex()).toBe(0);

      // Down arrow
      const resDown = browser.handleKey("\x1b[B");
      expect(resDown.action).toBe("render");
      expect(browser.getSelectedIndex()).toBe(1);

      // 'j' key
      browser.handleKey("j");
      expect(browser.getSelectedIndex()).toBe(2);

      // Up arrow
      const resUp = browser.handleKey("\x1b[A");
      expect(resUp.action).toBe("render");
      expect(browser.getSelectedIndex()).toBe(1);

      // 'k' key
      browser.handleKey("k");
      expect(browser.getSelectedIndex()).toBe(0);
    });

    it("clamps at top and bottom boundaries", () => {
      browser.setSelectedIndex(0);
      browser.handleKey("\x1b[A");
      expect(browser.getSelectedIndex()).toBe(0);

      const totalRows = browser.getVisibleRows().length;
      browser.setSelectedIndex(totalRows - 1);
      browser.handleKey("\x1b[B");
      expect(browser.getSelectedIndex()).toBe(totalRows - 1);
    });
  });

  describe("Folder Expand / Collapse Interactions", () => {
    let browser: ModelAccordionBrowser;

    beforeEach(() => {
      browser = new ModelAccordionBrowser(sampleModels);
      browser.collapseAll();
    });

    it("toggles provider folder expansion via Space", () => {
      browser.setSelectedIndex(0); // Anthropic provider folder
      const rowsBefore = browser.getVisibleRows();
      expect(rowsBefore[0]?.type).toBe("provider");
      expect(rowsBefore[0]?.expanded).toBe(false);

      // Press Space to expand
      browser.handleKey(" ");
      const rowsAfterExpand = browser.getVisibleRows();
      expect(rowsAfterExpand[0]?.expanded).toBe(true);
      expect(rowsAfterExpand.length).toBeGreaterThan(rowsBefore.length);

      // Press Space to collapse
      browser.handleKey(" ");
      const rowsAfterCollapse = browser.getVisibleRows();
      expect(rowsAfterCollapse[0]?.expanded).toBe(false);
      expect(rowsAfterCollapse.length).toBe(rowsBefore.length);
    });

    it("expands on Right Arrow and moves selection to first child if already expanded", () => {
      browser.setSelectedIndex(0);
      browser.handleKey("\x1b[C"); // Right arrow expands
      expect(browser.getProviderGroups()[0]?.expanded).toBe(true);

      // Press Right arrow again to jump to first child model
      browser.handleKey("\x1b[C");
      const current = browser.getVisibleRows()[browser.getSelectedIndex()];
      expect(current?.type).toBe("model");
      if (current?.type === "model") {
        expect(current.model.provider).toBe("anthropic");
      }
    });

    it("collapses on Left Arrow or jumps from model to parent provider", () => {
      browser.expandAll();
      // Position selection on Anthropic's second model (Claude 3.5 Haiku)
      browser.setSelectedIndex(2);
      const selRow = browser.getVisibleRows()[browser.getSelectedIndex()];
      expect(selRow?.type).toBe("model");

      // Press Left arrow: should jump selection up to parent provider folder
      browser.handleKey("\x1b[D");
      const parentRow = browser.getVisibleRows()[browser.getSelectedIndex()];
      expect(parentRow?.type).toBe("provider");
      expect(parentRow?.provider).toBe("anthropic");

      // Press Left arrow on provider: collapses it
      browser.handleKey("\x1b[D");
      expect(browser.getProviderGroups()[0]?.expanded).toBe(false);
    });
  });

  describe("Model Selection & Enter Key", () => {
    it("selects model and returns select action on Enter", () => {
      const browser = new ModelAccordionBrowser(sampleModels);
      browser.expandAll();

      // Find index of GPT-4o
      const rows = browser.getVisibleRows();
      const gpt4oIdx = rows.findIndex((r) => r.type === "model" && r.model.id === "openai/gpt-4o");
      expect(gpt4oIdx).toBeGreaterThan(0);

      browser.setSelectedIndex(gpt4oIdx);
      const res = browser.handleKey("\r");

      expect(res.action).toBe("select");
      expect(res.selectedModelId).toBe("openai/gpt-4o");
      expect(browser.getActiveModel()).toBe("openai/gpt-4o");
    });

    it("selects model on Space key", () => {
      const browser = new ModelAccordionBrowser(sampleModels);
      browser.expandAll();

      const rows = browser.getVisibleRows();
      const geminiIdx = rows.findIndex((r) => r.type === "model" && r.model.id === "google/gemini-2.5-pro");
      browser.setSelectedIndex(geminiIdx);

      const res = browser.handleKey(" ");
      expect(res.action).toBe("select");
      expect(res.selectedModelId).toBe("google/gemini-2.5-pro");
    });

    it("toggles provider folder expansion on Enter when on provider row", () => {
      const browser = new ModelAccordionBrowser(sampleModels);
      browser.collapseAll();
      browser.setSelectedIndex(0);

      const res = browser.handleKey("\n");
      expect(res.action).toBe("render");
      expect(browser.getProviderGroups()[0]?.expanded).toBe(true);
    });
  });

  describe("Escape Key Behavior", () => {
    it("returns close action when not searching", () => {
      const browser = new ModelAccordionBrowser(sampleModels);
      const res1 = browser.handleKey("\x1b");
      expect(res1.action).toBe("close");

      const res2 = browser.handleKey("\u001B");
      expect(res2.action).toBe("close");

      const res3 = browser.handleKey("escape");
      expect(res3.action).toBe("close");
    });

    it("cancels search and clears query on Escape instead of closing", () => {
      const browser = new ModelAccordionBrowser(sampleModels);
      // Trigger search
      browser.handleKey("/");
      browser.handleKey("g");
      browser.handleKey("p");
      browser.handleKey("t");

      expect(browser.getSearchFilter()).toBe("gpt");

      // Press Escape
      const res = browser.handleKey("\x1b");
      expect(res.action).toBe("render");
      expect(browser.getSearchFilter()).toBe("");
    });
  });

  describe("Search & Query Filtering", () => {
    it("filters models dynamically via search input", () => {
      const browser = new ModelAccordionBrowser(sampleModels);
      browser.collapseAll();

      // Enter search mode with '/'
      browser.handleKey("/");
      browser.handleKey("r");
      browser.handleKey("1");

      const visible = browser.getVisibleRows();
      // Should auto-expand DeepSeek and show only DeepSeek R1
      expect(visible.some((r) => r.type === "model" && r.model.id === "deepseek/deepseek-r1")).toBe(true);
      expect(visible.some((r) => r.type === "model" && r.model.id === "openai/gpt-4o")).toBe(false);

      // Backspace removes char
      browser.handleKey("\x7f");
      expect(browser.getSearchFilter()).toBe("r");
    });

    it("filters models directly via setSearchFilter", () => {
      const browser = new ModelAccordionBrowser(sampleModels);
      browser.setSearchFilter("haiku");

      const visible = browser.getVisibleRows();
      expect(visible.length).toBe(2); // Anthropic provider row + Claude 3.5 Haiku row
      expect(visible[1]?.type).toBe("model");
      if (visible[1]?.type === "model") {
        expect(visible[1].model.id).toBe("anthropic/claude-3.5-haiku");
      }
    });
  });

  describe("Antigravity ANSI Rendering", () => {
    it("renders formatted frame with title, count pill, folder glyphs, and tree connectors", () => {
      const browser = new ModelAccordionBrowser(sampleModels, "anthropic/claude-3.5-sonnet");
      browser.expandAll();

      const lines = browser.render(84, 20);
      expect(lines.length).toBeGreaterThanOrEqual(10);

      const fullOutput = lines.join("\n");
      const cleanOutput = lines.map((l) => TuiSanitizer.sanitize(l)).join("\n");

      // Title and header badges
      expect(cleanOutput).toContain("OPENROUTER MODEL EXPLORER");
      expect(cleanOutput).toContain("5 Models");
      expect(cleanOutput).toContain("claude-3.5-sonnet");

      // Provider rows & folder glyphs
      expect(cleanOutput).toContain("Anthropic");
      expect(cleanOutput).toContain("OpenAI");
      expect(cleanOutput).toContain("Google");
      expect(cleanOutput).toContain("DeepSeek");

      // Tree connectors and model badges
      expect(cleanOutput).toContain("Claude 3.5 Sonnet");
      expect(cleanOutput).toContain("[200k ctx]");
      expect(cleanOutput).toContain("(ACTIVE)");

      // Footer navigation hints
      expect(cleanOutput).toContain("[↑/↓] Navigate");
      expect(cleanOutput).toContain("[Enter] Select");
      expect(cleanOutput).toContain("[Esc] Close");

      // Verify TrueColor / ANSI escape codes exist in raw output
      expect(fullOutput).toContain("\x1b[38;2;0;242;254m"); // Neon cyan border
      expect(fullOutput).toContain("\x1b[48;2;16;38;56m"); // Selection highlight bg
    });

    it("renders empty search state message when no models match", () => {
      const browser = new ModelAccordionBrowser(sampleModels);
      browser.setSearchFilter("non-existent-query-12345");

      const lines = browser.render(84, 15);
      const cleanOutput = lines.map((l) => TuiSanitizer.sanitize(l)).join("\n");
      expect(cleanOutput).toContain("No models found matching");
    });
  });
});
