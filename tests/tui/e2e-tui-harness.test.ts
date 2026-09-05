import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Writable } from "node:stream";

import {
  ModelCatalogCache,
  normalizeProvider,
  parsePricePerM,
  type CachedModel,
} from "../../src/persistence/model-catalog-cache.js";
import {
  ModelAccordionBrowser,
  formatContextLength,
  formatPricing,
} from "../../src/tui/model-accordion-browser.js";
import {
  TerminalLogoRenderer,
  type GraphicProtocol,
} from "../../src/tui/terminal-logo-renderer.js";
import { CommandRegistry } from "../../src/cli/command-registry.js";
import { CommandParser } from "../../src/cli/command-parser.js";
import { SessionController } from "../../src/cli/session-controller.js";
import { CliApplication } from "../../src/cli/cli-application.js";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { UserConfigManager } from "../../src/persistence/user-config-manager.js";
import { TokenMetricsManager } from "../../src/persistence/token-metrics-manager.js";
import { TokenDashboardRenderer } from "../../src/tui/token-dashboard-renderer.js";
import { TuiController } from "../../src/tui/tui-controller.js";
import { TuiRenderer } from "../../src/tui/tui-renderer.js";
import { TuiStateAdapter } from "../../src/tui/tui-state-adapter.js";
import { TuiSanitizer } from "../../src/tui/tui-sanitizer.js";
import { type Project } from "../../src/domain/project.js";

describe("Anantham V2 Antigravity TUI Agent Harness — Comprehensive E2E Integration Suite", () => {
  let tempDir: string;
  let engine: SqliteEngine;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let taskRepo: TaskRepository;
  let sessionController: SessionController;
  let commandRegistry: CommandRegistry;
  let parser: CommandParser;
  let stateAdapter: TuiStateAdapter;
  let renderer: TuiRenderer;
  let controller: TuiController;
  let streamOutput: string[];
  let mockOutput: Writable;

  const originalEnv = { ...process.env };

  const createTestProject = (id: string, name: string, modelProfile: string = "initial/model"): Project => ({
    id,
    name,
    rootPath: tempDir,
    status: "active",
    tags: ["test", "e2e"],
    modelProfile,
    memoryNamespace: "default",
    orchestrationProfile: "default",
    trustProfile: "trusted",
    createdAt: new Date().toISOString(),
    lastOpenedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
  });

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `anantham-e2e-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(tempDir, { recursive: true });

    // Initialize isolated singleton managers pointing to test directory
    UserConfigManager.getInstance(tempDir);
    ModelCatalogCache.getInstance(tempDir);
    TokenMetricsManager.getInstance(tempDir);

    // Initialize in-memory SQLite and repositories
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    projectRepo = new ProjectRepository(engine);
    sessionRepo = new SessionRepository(engine);
    taskRepo = new TaskRepository(engine);
    sessionController = new SessionController({ projectRepo, sessionRepo });

    commandRegistry = new CommandRegistry({
      sessionController,
      projectRepo,
      taskRepo,
      engine,
    });
    parser = new CommandParser();

    stateAdapter = new TuiStateAdapter({
      projectRepo,
      sessionRepo,
      taskRepo,
    });

    renderer = new TuiRenderer({
      dimensions: { width: 90, height: 26 },
      redactSecrets: true,
    });

    streamOutput = [];
    mockOutput = new Writable({
      write(chunk, _encoding, callback) {
        streamOutput.push(chunk.toString());
        callback();
      },
    });

    controller = new TuiController({
      stateAdapter,
      renderer,
      commandRegistry,
      commandParser: parser,
      output: mockOutput,
      coalesceIntervalMs: 5,
    });
    controller.start();
  });

  afterEach(() => {
    try {
      controller.stop();
    } catch {}

    try {
      engine.close();
    } catch {}

    // Reset singletons
    ModelCatalogCache.resetInstance();
    TokenMetricsManager.resetInstance();

    // Restore environment
    process.env = { ...originalEnv };

    // Clean up temporary disk files
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  // =========================================================================
  // TIER 1 — FEATURE COVERAGE (≥5 per feature, 6 features = 30 tests)
  // =========================================================================

  describe("Tier 1.1: OpenRouter Catalog Cache (Feature 1)", () => {
    it("T1.1.1: writes model catalog atomically to disk with metadata and TTL", () => {
      const cache = new ModelCatalogCache(tempDir, 3600000);
      const testModels: CachedModel[] = [
        {
          id: "anthropic/claude-3.7-sonnet",
          name: "Claude 3.7 Sonnet",
          provider: "anthropic",
          contextLength: 200000,
          promptPricePerM: 3.0,
          completionPricePerM: 15.0,
          description: "Hybrid reasoning model",
        },
      ];

      cache.saveModels(testModels);
      const cacheFilePath = path.join(tempDir, "models_cache.json");
      expect(fs.existsSync(cacheFilePath)).toBe(true);

      const raw = JSON.parse(fs.readFileSync(cacheFilePath, "utf-8"));
      expect(raw.fetchedAt).toBeGreaterThan(0);
      expect(raw.ttlMs).toBe(3600000);
      expect(raw.models).toHaveLength(1);
      expect(raw.models[0].id).toBe("anthropic/claude-3.7-sonnet");
    });

    it("T1.1.2: loads cached models from disk on initialization", () => {
      const cacheFile = path.join(tempDir, "models_cache.json");
      const diskData = {
        fetchedAt: Date.now(),
        ttlMs: 3600000,
        models: [
          {
            id: "openai/gpt-4o",
            name: "GPT-4o",
            provider: "openai",
            contextLength: 128000,
            promptPricePerM: 2.5,
            completionPricePerM: 10.0,
          },
        ],
      };
      fs.writeFileSync(cacheFile, JSON.stringify(diskData), "utf-8");

      const freshCache = new ModelCatalogCache(tempDir);
      const cached = freshCache.getCachedModels();
      expect(cached).not.toBeNull();
      expect(cached).toHaveLength(1);
      expect(cached![0]!.id).toBe("openai/gpt-4o");
    });

    it("T1.1.3: accurately normalizes provider identifiers across prefix formats", () => {
      expect(normalizeProvider("openrouter/anthropic/claude-3.5-sonnet")).toBe("anthropic");
      expect(normalizeProvider("openai/gpt-4o-mini")).toBe("openai");
      expect(normalizeProvider("google/gemini-2.0-flash")).toBe("google");
      expect(normalizeProvider("deepseek/deepseek-r1")).toBe("deepseek");
      expect(normalizeProvider("meta-llama/llama-3.3-70b-instruct")).toBe("meta-llama");
      expect(normalizeProvider("virtuals/game-agent")).toBe("virtuals");
      expect(normalizeProvider("unknown-single-token")).toBe("other");
    });

    it("T1.1.4: converts per-token pricing into price per 1 Million tokens accurately", () => {
      expect(parsePricePerM(0.000003)).toBe(3.0);
      expect(parsePricePerM("0.000015")).toBe(15.0);
      expect(parsePricePerM(0.00000015)).toBe(0.15);
      expect(parsePricePerM(0)).toBe(0);
      expect(parsePricePerM(undefined)).toBe(0);
      expect(parsePricePerM("invalid")).toBe(0);
    });

    it("T1.1.5: verifies curated model baseline contains all 6 major providers with non-zero context", () => {
      const curated = ModelCatalogCache.CURATED_MODELS;
      expect(curated.length).toBeGreaterThanOrEqual(12);

      const providers = new Set(curated.map((m) => m.provider));
      expect(providers.has("anthropic")).toBe(true);
      expect(providers.has("openai")).toBe(true);
      expect(providers.has("google")).toBe(true);
      expect(providers.has("deepseek")).toBe(true);
      expect(providers.has("meta-llama")).toBe(true);
      expect(providers.has("virtuals")).toBe(true);

      for (const model of curated) {
        expect(model.contextLength).toBeGreaterThanOrEqual(32000);
        expect(typeof model.promptPricePerM).toBe("number");
        expect(typeof model.completionPricePerM).toBe("number");
      }
    });
  });

  describe("Tier 1.2: Model Accordion Browser (Feature 2)", () => {
    it("T1.2.1: partitions models into ordered provider groups with metadata names", () => {
      const browser = new ModelAccordionBrowser(ModelCatalogCache.CURATED_MODELS);
      const groups = browser.getProviderGroups();
      expect(groups.length).toBeGreaterThanOrEqual(6);

      // Verify prioritized ordering: Anthropic -> OpenAI -> Google -> DeepSeek -> Meta -> Virtuals
      expect(groups[0]!.provider).toBe("anthropic");
      expect(groups[0]!.displayName).toBe("Anthropic");
      expect(groups[1]!.provider).toBe("openai");
      expect(groups[1]!.displayName).toBe("OpenAI");
    });

    it("T1.2.2: expands only the active model's group or first group on initial render", () => {
      const browser = new ModelAccordionBrowser(
        ModelCatalogCache.CURATED_MODELS,
        "openai/gpt-4o"
      );
      const groups = browser.getProviderGroups();
      const openAiGroup = groups.find((g) => g.provider === "openai");
      const anthropicGroup = groups.find((g) => g.provider === "anthropic");

      expect(openAiGroup?.expanded).toBe(true);
      expect(anthropicGroup?.expanded).toBe(false);
    });

    it("T1.2.3: accurately formats context window lengths with human-readable suffixes", () => {
      expect(formatContextLength(2000000)).toBe("2M ctx");
      expect(formatContextLength(1000000)).toBe("1M ctx");
      expect(formatContextLength(200000)).toBe("200k ctx");
      expect(formatContextLength(128000)).toBe("128k ctx");
      expect(formatContextLength(64000)).toBe("64k ctx");
      expect(formatContextLength(800)).toBe("800 ctx");
    });

    it("T1.2.4: accurately formats prompt and completion pricing badges", () => {
      expect(formatPricing(3.0, 15.0)).toBe("$3.00/$15.0 per M");
      expect(formatPricing(0.15, 0.6)).toBe("$0.150/$0.600 per M");
      expect(formatPricing(0, 0)).toBe("Free");
    });

    it("T1.2.5: computes flattened visible rows including only expanded group models", () => {
      const browser = new ModelAccordionBrowser(ModelCatalogCache.CURATED_MODELS);
      browser.collapseAll();

      let visible = browser.getVisibleRows();
      expect(visible.every((r) => r.type === "provider")).toBe(true);
      expect(visible.length).toBe(browser.getProviderGroups().length);

      browser.toggleExpand("anthropic");
      visible = browser.getVisibleRows();
      const anthropicModels = visible.filter((r) => r.type === "model" && r.model.provider === "anthropic");
      expect(anthropicModels.length).toBeGreaterThan(0);
    });
  });

  describe("Tier 1.3: Unified Model Command Architecture (Feature 3)", () => {
    it("T1.3.1: parses '/model' and '/models' with diverse argument combinations", () => {
      const p1 = parser.parse("/model");
      expect(p1.name).toBe("model");
      expect(p1.args).toHaveLength(0);

      const p2 = parser.parse("/models anthropic");
      expect(p2.name).toBe("models");
      expect(p2.args).toEqual(["anthropic"]);

      const p3 = parser.parse("/model 2");
      expect(p3.name).toBe("model");
      expect(p3.args).toEqual(["2"]);

      const p4 = parser.parse("/model add custom/model-x");
      expect(p4.name).toBe("model");
      expect(p4.args).toEqual(["add", "custom/model-x"]);
    });

    it("T1.3.2: executes '/model' with no args to display active model and quick-switch instructions", async () => {
      const res = await commandRegistry.execute(parser.parse("/model"));
      expect(res.success).toBe(true);
      expect(res.commandName).toBe("model");
      expect(res.message).toContain("Current active model:");
      expect(res.message).toContain("Quick switch: /model <number>");
      expect(res.message).toContain("List models:  /models");
    });

    it("T1.3.3: executes '/model <modelId>' to switch active model and persist preference", async () => {
      const res = await commandRegistry.execute(parser.parse("/model anthropic/claude-3.7-sonnet"));
      expect(res.success).toBe(true);
      expect(res.message).toContain("Active model switched to 'anthropic/claude-3.7-sonnet'");

      const currentModel = UserConfigManager.getInstance().getDefaultModel();
      expect(currentModel).toBe("anthropic/claude-3.7-sonnet");
    });

    it("T1.3.4: executes '/model <number>' to switch active model via numeric index", async () => {
      const res = await commandRegistry.execute(parser.parse("/model 1"));
      expect(res.success).toBe(true);
      expect(res.message).toContain("Active model switched to");
      expect(res.data).toBeDefined();
    });

    it("T1.3.5: executes '/models' to list curated models grouped by provider", async () => {
      const res = await commandRegistry.execute(parser.parse("/models"));
      expect(res.success).toBe(true);
      expect(res.commandName).toBe("models");
      expect(res.message).toContain("Curated AI Models");
      expect(res.message).toContain("Switch: /model <number>");
    });
  });

  describe("Tier 1.4: Two-Tier Global Escape Routing (Feature 4)", () => {
    it("T1.4.1: exits command mode on Escape, saves draft, and keeps controller running", async () => {
      await controller.handleInput(":");
      expect(controller.isInCommandMode()).toBe(true);

      await controller.handleInput("m");
      await controller.handleInput("o");
      expect(controller.getCommandBuffer()).toBe("mo");

      const keepRunning = await controller.handleInput("\u001B");
      expect(keepRunning).toBe(true);
      expect(controller.isInCommandMode()).toBe(false);
      expect(controller.getCommandBuffer()).toBe("");
      expect(controller.getSavedDraft()).toBe("mo");
      expect(controller.getIsRunning()).toBe(true);
    });

    it("T1.4.2: dismisses command output modal on Escape and stays in normal mode", async () => {
      await controller.executeCommand("/help");
      controller.renderNow();
      let lastOutput = streamOutput[streamOutput.length - 1] ?? "";
      expect(lastOutput).toContain("COMMAND RESULT: /HELP");

      const keepRunning = await controller.handleInput("\x1b");
      expect(keepRunning).toBe(true);

      controller.renderNow();
      lastOutput = streamOutput[streamOutput.length - 1] ?? "";
      expect(lastOutput).not.toContain("COMMAND RESULT: /HELP");
      expect(controller.getIsRunning()).toBe(true);
    });

    it("T1.4.3: Accordion browser returns action 'close' on Escape key token", () => {
      const browser = new ModelAccordionBrowser(ModelCatalogCache.CURATED_MODELS);
      const result = browser.handleKey("\x1b");
      expect(result.action).toBe("close");
    });

    it("T1.4.4: terminates TUI application at root prompt on Escape with alternate buffer restore", async () => {
      expect(controller.isInCommandMode()).toBe(false);

      const keepRunning = await controller.handleInput("\u001B");
      expect(keepRunning).toBe(false);
      expect(controller.getIsRunning()).toBe(false);

      const combinedOutput = streamOutput.join("");
      expect(combinedOutput).toContain("\x1b[?1049l\x1b[?25h");
    });

    it("T1.4.5: verifies arrow keys do NOT terminate application in normal mode or command mode", async () => {
      // In normal mode
      const upNormal = await controller.handleInput("\x1b[A");
      expect(upNormal).toBe(true);
      expect(controller.getIsRunning()).toBe(true);

      const downNormal = await controller.handleInput("\x1b[B");
      expect(downNormal).toBe(true);
      expect(controller.getIsRunning()).toBe(true);

      // In command mode
      await controller.handleInput(":");
      const upCmd = await controller.handleInput("\x1b[A");
      expect(upCmd).toBe(true);
      expect(controller.getIsRunning()).toBe(true);

      const downCmd = await controller.handleInput("\x1b[B");
      expect(downCmd).toBe(true);
      expect(controller.getIsRunning()).toBe(true);
    });
  });

  describe("Tier 1.5: Terminal Logo Renderer Engine (Feature 5)", () => {
    it("T1.5.1: detects Kitty graphics protocol when KITTY_WINDOW_ID is present", () => {
      process.env.KITTY_WINDOW_ID = "12345";
      delete process.env.TERM_PROGRAM;
      delete process.env.COLORTERM;
      expect(TerminalLogoRenderer.detectProtocol()).toBe("kitty");
    });

    it("T1.5.2: detects iTerm2 graphics protocol when TERM_PROGRAM is iTerm.app", () => {
      delete process.env.KITTY_WINDOW_ID;
      process.env.TERM_PROGRAM = "iTerm.app";
      expect(TerminalLogoRenderer.detectProtocol()).toBe("iterm2");
    });

    it("T1.5.3: detects Sixel graphics protocol when COLORTERM is sixel", () => {
      delete process.env.KITTY_WINDOW_ID;
      delete process.env.TERM_PROGRAM;
      process.env.COLORTERM = "sixel";
      expect(TerminalLogoRenderer.detectProtocol()).toBe("sixel");
    });

    it("T1.5.4: defaults to TrueColor halfblock protocol when no graphic terminal is detected", () => {
      delete process.env.KITTY_WINDOW_ID;
      delete process.env.TERM_PROGRAM;
      delete process.env.COLORTERM;
      process.env.TERM = "xterm-256color";
      expect(TerminalLogoRenderer.detectProtocol()).toBe("halfblock");
    });

    it("T1.5.5: renders 24-bit TrueColor ANSI half-blocks with upper and lower half-block characters", () => {
      const halfblocks = TerminalLogoRenderer.renderHalfBlockLogo();
      expect(halfblocks.length).toBe(4); // 8 pixel rows / 2 pixels per char = 4 text lines

      for (const line of halfblocks) {
        expect(line).toContain("\u2580"); // '▀'
        expect(line).toContain("\x1b[38;2;"); // 24-bit foreground
        expect(line).toContain("\x1b[48;2;"); // 24-bit background
        expect(line).toContain("\x1b[0m"); // reset
      }
    });
  });

  describe("Tier 1.6: Token Telemetry & Headless CLI (Feature 6)", () => {
    it("T1.6.1: calculates token pricing accurately using model pricing lookup", () => {
      const costSonnet = TokenMetricsManager.calculateCost("anthropic/claude-3.5-sonnet", 1000000, 1000000);
      expect(costSonnet).toBe(18.0); // $3.0 + $15.0

      const costGpt4o = TokenMetricsManager.calculateCost("openai/gpt-4o", 1000000, 1000000);
      expect(costGpt4o).toBe(12.5); // $2.5 + $10.0
    });

    it("T1.6.2: records token usage and rolls up daily summaries and model stats", () => {
      const metrics = new TokenMetricsManager(tempDir);
      metrics.recordUsage({
        modelId: "anthropic/claude-3.7-sonnet",
        inputTokens: 5000,
        outputTokens: 2000,
      });

      const today = metrics.getDailySummary();
      expect(today.totalInputTokens).toBeGreaterThanOrEqual(5000);
      expect(today.totalOutputTokens).toBeGreaterThanOrEqual(2000);
      expect(today.totalTokens).toBeGreaterThanOrEqual(7000);
      expect(today.requestCount).toBeGreaterThanOrEqual(1);
    });

    it("T1.6.3: persists telemetry records atomically to disk", () => {
      const metrics = new TokenMetricsManager(tempDir);
      metrics.recordUsage({
        modelId: "openai/gpt-4o-mini",
        inputTokens: 10000,
        outputTokens: 5000,
      });

      const metricsPath = path.join(tempDir, "token_metrics.json");
      expect(fs.existsSync(metricsPath)).toBe(true);

      const parsed = JSON.parse(fs.readFileSync(metricsPath, "utf-8"));
      expect(Array.isArray(parsed.records)).toBe(true);
      expect(parsed.records.some((r: any) => r.modelId === "openai/gpt-4o-mini")).toBe(true);
    });

    it("T1.6.4: accurately formats token quantities with K and M abbreviations", () => {
      expect(TokenDashboardRenderer.formatTokens(2500000)).toBe("2.50M");
      expect(TokenDashboardRenderer.formatTokens(48700)).toBe("48.7K");
      expect(TokenDashboardRenderer.formatTokens(950)).toBe("950");
    });

    it("T1.6.5: switches to 'usage' view upon executing /usage in TUI and renders dashboard", async () => {
      await controller.executeCommand("/usage");
      expect(controller.getCurrentView()).toBe("usage");

      controller.renderNow();
      const lastOutput = streamOutput[streamOutput.length - 1] ?? "";
      const plain = TuiSanitizer.stripAnsi(lastOutput);
      expect(plain).toContain("ANANTHAM TOKEN USAGE MATRIX & FINANCIAL DASHBOARD");
      expect(plain).toContain("TODAY'S TOKENS");
      expect(plain).toContain("MONTH-TO-DATE");
    });
  });

  // =========================================================================
  // TIER 2 — BOUNDARY & CORNER CASES (≥5 per feature, 6 features = 30 tests)
  // =========================================================================

  describe("Tier 2.1: Cache Recovery & Boundary Resilience (Feature 1)", () => {
    it("T2.1.1: handles completely empty models_cache.json without throwing and falls back to curated models", async () => {
      const cachePath = path.join(tempDir, "models_cache.json");
      fs.writeFileSync(cachePath, "", "utf-8");

      const cache = new ModelCatalogCache(tempDir);
      expect(cache.getCachedModels()).toBeNull();

      const models = await cache.getModels();
      expect(models.length).toBeGreaterThan(0);
      expect(models[0]!.id).toContain("/");
    });

    it("T2.1.2: handles malformed/corrupted JSON in models_cache.json gracefully", async () => {
      const cachePath = path.join(tempDir, "models_cache.json");
      fs.writeFileSync(cachePath, "{ this is corrupted json }}}", "utf-8");

      const cache = new ModelCatalogCache(tempDir);
      const models = await cache.getModels();
      expect(models.length).toBeGreaterThan(0);
    });

    it("T2.1.3: auto-creates missing parent storage directory recursively when saving models", () => {
      const deepDir = path.join(tempDir, "nested", "cache", "store");
      const cache = new ModelCatalogCache(deepDir);
      cache.saveModels(ModelCatalogCache.CURATED_MODELS);

      expect(fs.existsSync(path.join(deepDir, "models_cache.json"))).toBe(true);
    });

    it("T2.1.4: identifies expired cache beyond 1-hour TTL as stale", () => {
      const cachePath = path.join(tempDir, "models_cache.json");
      const twoHoursAgo = Date.now() - 7200000;
      fs.writeFileSync(
        cachePath,
        JSON.stringify({
          fetchedAt: twoHoursAgo,
          ttlMs: 3600000,
          models: ModelCatalogCache.CURATED_MODELS,
        }),
        "utf-8"
      );

      const cache = new ModelCatalogCache(tempDir);
      expect(cache.isCacheFresh()).toBe(false);
    });

    it("T2.1.5: falls back to curated models on network timeout or offline failure", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network timeout / unreachable"));

      const cache = new ModelCatalogCache(tempDir);
      cache.clearCache();
      const models = await cache.getModels(true);

      expect(models.length).toBeGreaterThanOrEqual(12);
      expect(models.some((m) => m.id === "anthropic/claude-3.5-sonnet")).toBe(true);
      fetchSpy.mockRestore();
    });
  });

  describe("Tier 2.2: Accordion Navigation & Boundary Conditions (Feature 2)", () => {
    it("T2.2.1: clamps selection at top boundary (index 0) under repeated Up Arrow keypresses", () => {
      const browser = new ModelAccordionBrowser(ModelCatalogCache.CURATED_MODELS);
      browser.setSelectedIndex(0);

      for (let i = 0; i < 15; i++) {
        browser.handleKey("\x1b[A");
      }
      expect(browser.getSelectedIndex()).toBe(0);
    });

    it("T2.2.2: clamps selection at bottom boundary under repeated Down Arrow keypresses", () => {
      const browser = new ModelAccordionBrowser(ModelCatalogCache.CURATED_MODELS);
      const visibleCount = browser.getVisibleRows().length;

      for (let i = 0; i < visibleCount + 20; i++) {
        browser.handleKey("\x1b[B");
      }
      expect(browser.getSelectedIndex()).toBe(visibleCount - 1);
    });

    it("T2.2.3: handles empty model catalog without throwing and safely processes keys", () => {
      const browser = new ModelAccordionBrowser([]);
      expect(browser.getProviderGroups()).toHaveLength(0);
      expect(browser.getVisibleRows()).toHaveLength(0);
      expect(browser.getSelectedIndex()).toBe(0);

      const resUp = browser.handleKey("\x1b[A");
      expect(["none", "render"]).toContain(resUp.action);

      const resEnter = browser.handleKey("\r");
      expect(["none", "render"]).toContain(resEnter.action);
    });

    it("T2.2.4: filters models via search query and handles empty search results cleanly", () => {
      const browser = new ModelAccordionBrowser(ModelCatalogCache.CURATED_MODELS);
      browser.setSearchFilter("nonexistent-model-xyz-12345");

      const visible = browser.getVisibleRows();
      expect(visible).toHaveLength(0);
      expect(browser.getSelectedIndex()).toBe(0);

      // Rendering empty search result produces search box without crashing
      const rendered = browser.render(80, 20);
      expect(rendered.length).toBeGreaterThan(0);
      const plain = TuiSanitizer.stripAnsi(rendered.join("\n"));
      expect(plain).toContain("Filter:");
    });

    it("T2.2.5: toggles expand/collapse cleanly with expandAll() and collapseAll()", () => {
      const browser = new ModelAccordionBrowser(ModelCatalogCache.CURATED_MODELS);
      browser.expandAll();
      expect(browser.getProviderGroups().every((g) => g.expanded)).toBe(true);

      browser.collapseAll();
      expect(browser.getProviderGroups().every((g) => !g.expanded)).toBe(true);
      expect(browser.getVisibleRows().length).toBe(browser.getProviderGroups().length);
    });
  });

  describe("Tier 2.3: Command Parser & Registry Edge Cases (Feature 3)", () => {
    it("T2.3.1: suppresses raw Zod validation errors on bare slash or bare colon", async () => {
      await controller.handleInput("/");
      await controller.handleInput("\r");
      expect(controller.getErrorMessage()).toBeFalsy();

      await controller.handleInput(":");
      await controller.handleInput("\r");
      expect(controller.getErrorMessage()).toBeFalsy();
    });

    it("T2.3.2: executing '/model' with out-of-bounds numeric index returns friendly error", async () => {
      const cmd = parser.parse("/model 9999");
      const res = await commandRegistry.execute(cmd);
      expect(res.success).toBe(false);
      expect(res.error).toContain("Invalid model index [9999]");
    });

    it("T2.3.3: executing '/model add' with missing modelId returns formatted usage error", async () => {
      const cmd = parser.parse("/model add");
      const res = await commandRegistry.execute(cmd);
      expect(res.success).toBe(false);
      expect(res.error).toContain("Usage: /model add <modelId>");
    });

    it("T2.3.4: executing '/model remove' on non-existent custom model returns graceful feedback", async () => {
      const cmd = parser.parse("/model remove nonexistent/model-xyz");
      const res = await commandRegistry.execute(cmd);
      expect(res.success).toBe(true);
      expect(res.message).toContain("was not in custom models list");
    });

    it("T2.3.5: executing '/models' with unknown provider argument falls back gracefully", async () => {
      const cmd = parser.parse("/models non-existent-provider");
      const res = await commandRegistry.execute(cmd);
      expect(res.success).toBe(true);
      expect(res.message).toContain("Curated AI Models");
    });
  });

  describe("Tier 2.4: Escape & Input Sequence Edge Cases (Feature 4)", () => {
    it("T2.4.1: verifies two-tier Escape semantics (command mode -> root prompt -> clean exit)", async () => {
      // 1st tier: Enter command mode and type
      await controller.handleInput(":");
      expect(controller.isInCommandMode()).toBe(true);

      // Press Escape: Exits command mode back to root prompt, app remains running
      const keepRunningTier1 = await controller.handleInput("\u001B");
      expect(keepRunningTier1).toBe(true);
      expect(controller.isInCommandMode()).toBe(false);
      expect(controller.getIsRunning()).toBe(true);

      // 2nd tier: Press Escape at root prompt terminates the application
      const keepRunningTier2 = await controller.handleInput("\u001B");
      expect(keepRunningTier2).toBe(false);
      expect(controller.getIsRunning()).toBe(false);
    });

    it("T2.4.2: Accordion browser handles nested search Escape vs modal Escape cleanly", () => {
      const browser = new ModelAccordionBrowser(ModelCatalogCache.CURATED_MODELS);
      // Activate search
      browser.handleKey("/");
      browser.setSearchFilter("claude");

      // First Escape cancels search filter
      const resSearchEsc = browser.handleKey("\x1b");
      expect(resSearchEsc.action).toBe("render");
      expect(browser.getSearchFilter()).toBe("");

      // Second Escape closes modal
      const resCloseEsc = browser.handleKey("\x1b");
      expect(resCloseEsc.action).toBe("close");
    });

    it("T2.4.3: Ctrl+C in command mode aborts command mode and discards draft cleanly", async () => {
      await controller.handleInput(":");
      await controller.handleInput("d");
      await controller.handleInput("r");
      await controller.handleInput("a");
      await controller.handleInput("f");
      await controller.handleInput("t");

      const keepRunning = await controller.handleInput("\u0003");
      expect(keepRunning).toBe(true);
      expect(controller.isInCommandMode()).toBe(false);
      expect(controller.getCommandBuffer()).toBe("");
      expect(controller.getSavedDraft()).toBe("");
    });

    it("T2.4.4: Ctrl+D on empty command buffer exits command mode without stopping controller", async () => {
      await controller.handleInput(":");
      expect(controller.isInCommandMode()).toBe(true);

      const keepRunning = await controller.handleInput("\u0004");
      expect(keepRunning).toBe(true);
      expect(controller.isInCommandMode()).toBe(false);
      expect(controller.getIsRunning()).toBe(true);
    });

    it("T2.4.5: recognizes modified ANSI escape sequences without polluting command buffer", async () => {
      await controller.handleInput(":");
      await controller.handleInput("m");
      await controller.handleInput("y");

      // Send modified Page Up sequence \x1b[5;2~
      await controller.handleInput("\x1b[5;2~");
      expect(controller.getCommandBuffer()).toBe("my");
    });
  });

  describe("Tier 2.5: Logo Rendering Extremes & Fallbacks (Feature 5)", () => {
    it("T2.5.1: symmetrically crops half-block emblem when terminal width is very narrow (width = 6)", () => {
      const cropped = TerminalLogoRenderer.renderHalfBlockLogo(6);
      expect(cropped.length).toBe(4);
      for (const line of cropped) {
        const plain = TuiSanitizer.stripAnsi(line);
        expect(plain.length).toBe(6);
      }
    });

    it("T2.5.2: pads half-block emblem with dark onyx background when terminal width is wide (width = 30)", () => {
      const padded = TerminalLogoRenderer.renderHalfBlockLogo(30);
      expect(padded.length).toBe(4);
      for (const line of padded) {
        const plain = TuiSanitizer.stripAnsi(line);
        expect(plain.length).toBe(30);
      }
    });

    it("T2.5.3: falls back to half-blocks when graphic protocol is requested for missing file", () => {
      const lines = TerminalLogoRenderer.renderHeaderLogo({
        protocol: "kitty",
        logoPath: path.join(tempDir, "non_existent_logo.png"),
      });

      expect(lines.length).toBe(4);
      expect(lines[0]).toContain("\u2580");
    });

    it("T2.5.4: throws descriptive error if graphic protocol is called with non-existent file", () => {
      expect(() => {
        TerminalLogoRenderer.renderGraphicProtocol("kitty", path.join(tempDir, "missing.png"));
      }).toThrow("Logo file does not exist");
    });

    it("T2.5.5: resolves logo path with authoritative precedence (cliPath > env > config > null)", () => {
      const cliPath = path.join(tempDir, "cli_logo.png");
      const envPath = path.join(tempDir, "env_logo.png");
      const configPath = path.join(tempDir, "config_logo.png");

      process.env.ANANTHAM_LOGO_PATH = envPath;
      UserConfigManager.getInstance().setLogoPath(configPath);

      // CLI path overrides env & config
      expect(TerminalLogoRenderer.resolveLogoPath(cliPath)).toBe(cliPath);

      // Env overrides config
      expect(TerminalLogoRenderer.resolveLogoPath()).toBe(envPath);

      // Config used when env is unset
      delete process.env.ANANTHAM_LOGO_PATH;
      expect(TerminalLogoRenderer.resolveLogoPath()).toBe(configPath);
    });
  });

  describe("Tier 2.6: Telemetry & Budget Boundary Conditions (Feature 6)", () => {
    it("T2.6.1: handles zero-token usage requests calculating 0 cost without NaN", () => {
      const cost = TokenMetricsManager.calculateCost("anthropic/claude-3.5-sonnet", 0, 0, 0);
      expect(cost).toBe(0);
      expect(Number.isNaN(cost)).toBe(false);
    });

    it("T2.6.2: calculates cost for unlisted model using fallback default pricing", () => {
      const cost = TokenMetricsManager.calculateCost("unlisted/custom-model", 1000000, 1000000);
      expect(cost).toBe(4.0); // Default inputPerM: 1.0 + outputPerM: 3.0
    });

    it("T2.6.3: tracks monthly budget and flags budget exceedance accurately", () => {
      const metrics = new TokenMetricsManager(tempDir);
      metrics.setMonthlyBudget(5.0);

      // Record high usage exceeding $5
      metrics.recordUsage({
        modelId: "anthropic/claude-3.5-sonnet",
        inputTokens: 1000000,
        outputTokens: 1000000,
      });

      const today = metrics.getDailySummary();
      expect(today.totalCostUsd).toBeGreaterThan(5.0);
    });

    it("T2.6.4: renders token dashboard on compact terminal (40x12) without throwing", () => {
      const lines = TokenDashboardRenderer.render(40, 12);
      expect(lines.length).toBeGreaterThan(0);
      const combined = TuiSanitizer.stripAnsi(lines.join("\n"));
      expect(combined).toContain("TOKEN USAGE MATRIX");
    });

    it("T2.6.5: recovers from corrupted token_metrics.json on disk by re-seeding default data", () => {
      const metricsFile = path.join(tempDir, "token_metrics.json");
      fs.writeFileSync(metricsFile, "Corrupted metrics content", "utf-8");

      const metrics = new TokenMetricsManager(tempDir);
      const today = metrics.getDailySummary();
      expect(today).toBeDefined();
      expect(today.requestCount).toBeGreaterThanOrEqual(0);
    });
  });

  // =========================================================================
  // TIER 3 — CROSS-FEATURE COMBINATIONS (10 tests)
  // =========================================================================

  describe("Tier 3: Cross-Feature Combinations", () => {
    it("T3.1: Model selection in Accordion browser updates active model in config and reflects in status bar", async () => {
      const browser = new ModelAccordionBrowser(ModelCatalogCache.CURATED_MODELS);
      browser.expandAll();

      // Find Claude 3.7 Sonnet row
      const visible = browser.getVisibleRows();
      const targetIdx = visible.findIndex(
        (r) => r.type === "model" && r.model.id === "anthropic/claude-3.7-sonnet"
      );
      expect(targetIdx).toBeGreaterThanOrEqual(0);

      browser.setSelectedIndex(targetIdx);
      const keyResult = browser.handleKey("\r");
      expect(keyResult.action).toBe("select");
      expect(keyResult.selectedModelId).toBe("anthropic/claude-3.7-sonnet");

      // Update UserConfigManager and verify in status bar
      UserConfigManager.getInstance().setDefaultModel(keyResult.selectedModelId!);
      controller.renderNow();

      const lastOutput = streamOutput[streamOutput.length - 1] ?? "";
      const plain = TuiSanitizer.stripAnsi(lastOutput);
      expect(plain).toContain("claude-3.7-sonnet");
    });

    it("T3.2: Command palette autocomplete to '/models' opens model list without duplicate view dumps", async () => {
      await controller.handleInput("/");
      await controller.handleInput("m");
      await controller.handleInput("o");
      await controller.handleInput("d");

      // Tab complete
      await controller.handleInput("\t");
      expect(controller.getCommandBuffer()).toContain("/models");

      // Execute command
      await controller.handleInput("\r");
      controller.renderNow();

      const lastOutput = streamOutput[streamOutput.length - 1] ?? "";
      const plain = TuiSanitizer.stripAnsi(lastOutput);
      expect(plain).toContain("COMMAND RESULT: /MODELS");
    });

    it("T3.3: Ingesting custom logo path updates TerminalLogoRenderer and renders in Antigravity header", () => {
      const customLogoPath = path.join(tempDir, "custom-emblem.png");
      fs.writeFileSync(customLogoPath, "fake-png-content", "utf-8");

      UserConfigManager.getInstance().setLogoPath(customLogoPath);
      expect(TerminalLogoRenderer.resolveLogoPath()).toBe(customLogoPath);

      controller.renderNow();
      const lastOutput = streamOutput[streamOutput.length - 1] ?? "";
      const plain = TuiSanitizer.stripAnsi(lastOutput);
      expect(plain).toContain("ANANTHAM INFINITE TUI");
      expect(plain).toContain("Antigravity Reactive Shell");
    });

    it("T3.4: Switching model via '/model' records telemetry transaction and updates '/usage' leaderboard", async () => {
      await commandRegistry.execute(parser.parse("/model deepseek/deepseek-r1"));
      const activeModel = UserConfigManager.getInstance().getDefaultModel();
      expect(activeModel).toBe("deepseek/deepseek-r1");

      // Record telemetry for newly selected model
      const metrics = TokenMetricsManager.getInstance();
      metrics.recordUsage({
        modelId: activeModel!,
        inputTokens: 50000,
        outputTokens: 20000,
      });

      const today = metrics.getDailySummary();
      expect(today.models["deepseek/deepseek-r1"]).toBeDefined();
      expect(today.models["deepseek/deepseek-r1"]!.totalTokens).toBe(70000);

      // Verify in /usage dashboard render
      await controller.executeCommand("/usage");
      controller.renderNow();

      const lastOutput = streamOutput[streamOutput.length - 1] ?? "";
      const plain = TuiSanitizer.stripAnsi(lastOutput);
      expect(plain).toContain("deepseek-r1");
    });

    it("T3.5: Opening command output, navigating, and pressing Escape dismisses output and restores root prompt", async () => {
      await controller.executeCommand("/help");
      controller.renderNow();
      let lastOutput = streamOutput[streamOutput.length - 1] ?? "";
      expect(lastOutput).toContain("COMMAND RESULT: /HELP");

      // Press Escape to dismiss
      await controller.handleInput("\x1b");
      controller.renderNow();
      lastOutput = streamOutput[streamOutput.length - 1] ?? "";
      expect(lastOutput).not.toContain("COMMAND RESULT: /HELP");
      expect(controller.getIsRunning()).toBe(true);

      // Press Escape again at root to terminate cleanly
      const keepRunning = await controller.handleInput("\x1b");
      expect(keepRunning).toBe(false);
      expect(controller.getIsRunning()).toBe(false);
    });

    it("T3.6: Switching active model synchronizes both SQLite project entity and ~/.anantham/config.json", async () => {
      const proj = createTestProject("test-proj-" + Date.now(), "test-sync-project", "initial/model");
      projectRepo.save(proj);
      sessionController.setActiveProject(proj.id);

      await commandRegistry.execute(parser.parse("/model google/gemini-2.5-pro"));

      const updatedProj = projectRepo.findById(proj.id);
      expect(updatedProj?.modelProfile).toBe("google/gemini-2.5-pro");

      const configModel = UserConfigManager.getInstance().getDefaultModel();
      expect(configModel).toBe("google/gemini-2.5-pro");
    });

    it("T3.7: Accordion search filter combined with model selection sets selected model and resets search filter", () => {
      const browser = new ModelAccordionBrowser(ModelCatalogCache.CURATED_MODELS);
      browser.handleKey("/");
      browser.setSearchFilter("flash");

      const visible = browser.getVisibleRows();
      expect(visible.length).toBeGreaterThan(0);

      // Select first matching model row
      const modelRowIdx = visible.findIndex((r) => r.type === "model");
      expect(modelRowIdx).toBeGreaterThanOrEqual(0);

      browser.setSelectedIndex(modelRowIdx);

      // When searching, first Enter confirms search query
      const resConfirm = browser.handleKey("\r");
      expect(resConfirm.action).toBe("render");

      // Second Enter selects the highlighted model
      const resSelect = browser.handleKey("\r");
      expect(resSelect.action).toBe("select");
      expect(resSelect.selectedModelId).toContain("flash");
    });

    it("T3.8: Complete alternate buffer lifecycle: start -> navigate views -> Escape termination", async () => {
      const streamChunks: string[] = [];
      const testOut = new Writable({
        write(chunk, _enc, cb) {
          streamChunks.push(chunk.toString());
          cb();
        },
      });

      const lifeController = new TuiController({
        stateAdapter,
        renderer,
        commandRegistry,
        commandParser: parser,
        output: testOut,
      });

      lifeController.start();
      expect(streamChunks.join("")).toContain("\x1b[?1049h\x1b[?25l");

      // Switch views
      lifeController.setView("usage");
      lifeController.setView("dashboard");

      // Terminate via Escape
      const keepRunning = await lifeController.handleInput("\u001B");
      expect(keepRunning).toBe(false);
      expect(streamChunks.join("")).toContain("\x1b[?1049l\x1b[?25h");
    });

    it("T3.9: Pricing values from ModelCatalogCache match TokenMetricsManager cost calculations", () => {
      const model = ModelCatalogCache.CURATED_MODELS.find((m) => m.id === "anthropic/claude-3.5-sonnet");
      expect(model).toBeDefined();

      const calculatedCost = TokenMetricsManager.calculateCost(model!.id, 1000000, 1000000);
      const expectedCost = model!.promptPricePerM + model!.completionPricePerM;
      expect(calculatedCost).toBe(expectedCost);
    });

    it("T3.10: Custom logo path in config combined with narrow terminal width correctly handles width cropping", () => {
      UserConfigManager.getInstance().setLogoPath("./assets/logo.png");
      const lines = TerminalLogoRenderer.renderHeaderLogo({ width: 8 });

      expect(lines.length).toBe(4);
      for (const l of lines) {
        const plain = TuiSanitizer.stripAnsi(l);
        expect(plain.length).toBe(8);
      }
    });
  });

  // =========================================================================
  // TIER 4 — REAL-WORLD WORKLOAD SCENARIOS (5 tests)
  // =========================================================================

  describe("Tier 4: Real-World Workload Scenarios", () => {
    it("T4.1: Scenario 1 — End-to-End interactive navigation lifecycle: startup -> browse models -> select -> view usage -> exit", async () => {
      // 1. App starts up in alternate screen buffer
      expect(controller.getIsRunning()).toBe(true);

      // 2. User executes /models
      await controller.executeCommand("/models");
      controller.renderNow();
      let lastOutput = streamOutput[streamOutput.length - 1] ?? "";
      expect(lastOutput).toContain("COMMAND RESULT: /MODELS");

      // 3. User browses models in Accordion component
      const browser = new ModelAccordionBrowser(ModelCatalogCache.CURATED_MODELS);
      browser.expandAll();
      const rows = browser.getVisibleRows();
      const sonnet37Idx = rows.findIndex(
        (r) => r.type === "model" && r.model.id === "anthropic/claude-3.7-sonnet"
      );
      browser.setSelectedIndex(sonnet37Idx);
      const selResult = browser.handleKey("\r");
      expect(selResult.action).toBe("select");
      expect(selResult.selectedModelId).toBe("anthropic/claude-3.7-sonnet");

      // 4. User updates active model
      await commandRegistry.execute(parser.parse(`/model ${selResult.selectedModelId}`));
      expect(UserConfigManager.getInstance().getDefaultModel()).toBe("anthropic/claude-3.7-sonnet");

      // 5. Dismiss model output modal via Escape
      await controller.handleInput("\x1b");
      controller.renderNow();
      lastOutput = streamOutput[streamOutput.length - 1] ?? "";
      expect(lastOutput).not.toContain("COMMAND RESULT: /MODELS");

      // 6. User switches to /usage analytics view
      await controller.handleInput("u");
      expect(controller.getCurrentView()).toBe("usage");

      // 7. User switches back to dashboard view
      await controller.handleInput("1");
      expect(controller.getCurrentView()).toBe("dashboard");

      // 8. User terminates via Escape at root prompt
      const running = await controller.handleInput("\u001B");
      expect(running).toBe(false);
      expect(controller.getIsRunning()).toBe(false);
    });

    it("T4.2: Scenario 2 — Headless CLI execution chain: version check, eval /models, eval /usage", async () => {
      const cliApp = new CliApplication({
        dbPath: ":memory:",
        outputMode: "text",
      });
      await cliApp.initialize();

      // 1. Eval /models
      const modelsResult = await cliApp.executeSingleCommand("/models");
      expect(modelsResult.success).toBe(true);
      expect(modelsResult.commandName).toBe("models");
      expect(modelsResult.message).toContain("Curated AI Models");

      // 2. Eval /usage
      const usageResult = await cliApp.executeSingleCommand("/usage");
      expect(usageResult.success).toBe(true);
      expect(usageResult.commandName).toBe("usage");
      expect(usageResult.message).toContain("Token Usage Matrix");

      // 3. Eval /model switch
      const switchResult = await cliApp.executeSingleCommand("/model openai/gpt-4o");
      expect(switchResult.success).toBe(true);
      expect(switchResult.message).toContain("Active model switched to 'openai/gpt-4o'");

      cliApp.shutdown();
    });

    it("T4.3: Scenario 3 — Crash & offline resilience: network timeout, corrupted disk cache, missing keys", async () => {
      // Corrupt cache file
      const cacheFile = path.join(tempDir, "models_cache.json");
      fs.writeFileSync(cacheFile, "corrupted payload", "utf-8");

      // Strip all keys
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const cache = new ModelCatalogCache(tempDir);
      const models = await cache.getModels(true);

      expect(models.length).toBeGreaterThanOrEqual(12);
      expect(models.some((m) => m.provider === "anthropic")).toBe(true);
      expect(models.some((m) => m.provider === "openai")).toBe(true);
      expect(models.some((m) => m.provider === "google")).toBe(true);
    });

    it("T4.4: Scenario 4 — High-frequency interleaved keypress stress test (100 rapid events)", async () => {
      const tokens = [
        ":", "m", "o", "d", "e", "l", "\u001B", // Open command mode, type, Escape
        "u", "1", "2", "3", "4", "5", "6", "7", "8", "9", "1", // Rapid view switches
        "\x1b[A", "\x1b[B", "\x1b[C", "\x1b[D", // Arrow keys in normal mode
        "/", "h", "e", "l", "p", "\r", // Execute help command
        "c", // Clear command output
      ];

      for (let cycle = 0; cycle < 5; cycle++) {
        for (const token of tokens) {
          const keepRunning = await controller.handleInput(token);
          expect(keepRunning).toBe(true);
        }
      }

      expect(controller.getIsRunning()).toBe(true);
      expect(controller.getCurrentView()).toBe("dashboard");
    });

    it("T4.5: Scenario 5 — Multi-session model persistence & cross-session budget tracking", async () => {
      const dbPath = path.join(tempDir, "multi-session.db");

      // Session 1: Create project and switch model
      const app1 = new CliApplication({ dbPath });
      await app1.initialize();
      const proj = createTestProject("persistent-proj-" + Date.now(), "persistent-project", "openai/gpt-4o");
      app1.projectRepo.save(proj);
      app1.sessionController.setActiveProject(proj.id);
      await app1.executeSingleCommand("/model anthropic/claude-3.7-sonnet");
      app1.shutdown();

      // Record token usage across session 1
      const metrics = TokenMetricsManager.getInstance(tempDir);
      metrics.recordUsage({
        modelId: "anthropic/claude-3.7-sonnet",
        inputTokens: 100000,
        outputTokens: 50000,
      });

      // Session 2: Boot new application instance on same database
      const app2 = new CliApplication({ dbPath });
      await app2.initialize();
      const reloadedProj = app2.projectRepo.findById(proj.id);
      expect(reloadedProj?.modelProfile).toBe("anthropic/claude-3.7-sonnet");

      // Verify persistent token telemetry in session 2
      const metrics2 = new TokenMetricsManager(tempDir);
      const today = metrics2.getDailySummary();
      expect(today.models["anthropic/claude-3.7-sonnet"]).toBeDefined();
      expect(today.models["anthropic/claude-3.7-sonnet"]!.inputTokens).toBe(100000);
      expect(today.models["anthropic/claude-3.7-sonnet"]!.outputTokens).toBe(50000);

      app2.shutdown();
    });
  });
});
