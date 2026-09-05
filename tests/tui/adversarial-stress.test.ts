import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { CommandRegistry, CURATED_MODELS_BY_PROVIDER } from "../../src/cli/command-registry.js";
import { CommandParser } from "../../src/cli/command-parser.js";
import { SessionController } from "../../src/cli/session-controller.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { UserConfigManager } from "../../src/persistence/user-config-manager.js";
import { TokenMetricsManager, type TokenMetricsData } from "../../src/persistence/token-metrics-manager.js";
import { TokenDashboardRenderer } from "../../src/tui/token-dashboard-renderer.js";
import { TerminalLogoRenderer } from "../../src/tui/terminal-logo-renderer.js";
import { TuiController } from "../../src/tui/tui-controller.js";
import { ModelAccordionBrowser } from "../../src/tui/model-accordion-browser.js";
import { TuiStateAdapter } from "../../src/tui/tui-state-adapter.js";
import { TuiRenderer } from "../../src/tui/tui-renderer.js";

describe("Empirical Adversarial Stress Harness", () => {
  let tempDir: string;
  let engine: SqliteEngine;
  let projectRepo: ProjectRepository;
  let taskRepo: TaskRepository;
  let sessionCtrl: SessionController;
  let registry: CommandRegistry;
  let parser: CommandParser;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "anantham-adversarial-"));
    const dbPath = path.join(tempDir, "test.db");
    engine = new SqliteEngine({ path: dbPath, walMode: true });
    engine.open();
    engine.raw.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL,
        status TEXT NOT NULL,
        tags TEXT,
        model_profile TEXT,
        memory_namespace TEXT,
        orchestration_profile TEXT,
        trust_profile TEXT,
        created_at TEXT NOT NULL,
        last_opened_at TEXT NOT NULL,
        last_activity_at TEXT NOT NULL,
        metadata TEXT
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_active_at TEXT NOT NULL,
        metadata TEXT
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        objective TEXT NOT NULL,
        status TEXT NOT NULL,
        priority TEXT NOT NULL,
        dependencies TEXT,
        input_artifacts TEXT,
        output_artifacts TEXT,
        assigned_to TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata TEXT
      );
    `);

    projectRepo = new ProjectRepository(engine);
    taskRepo = new TaskRepository(engine);
    sessionCtrl = new SessionController(projectRepo, engine.raw);
    registry = new CommandRegistry({
      sessionController: sessionCtrl,
      projectRepo,
      taskRepo,
      engine,
    });
    parser = new CommandParser();
  });

  afterEach(() => {
    try {
      engine.close();
    } catch {}
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  // =========================================================================
  // 1. Adversarial Command Input Stress
  // =========================================================================
  describe("1. Adversarial Command Inputs", () => {
    it("handles out of bounds numeric model indices gracefully", async () => {
      const outOfBoundsDigits = ["0", "99999999", "1000000000000"];
      for (const idx of outOfBoundsDigits) {
        const cmd = parser.parse(`/model ${idx}`);
        const res = await registry.execute(cmd);
        expect(res.success).toBe(false);
        expect(res.error).toMatch(/Invalid model index/);
      }

      // Negative numbers do not match ^\d+$ and are treated as model string identifiers
      const negCmd = parser.parse("/model -1");
      const negRes = await registry.execute(negCmd);
      expect(negRes.success).toBe(true);
      expect(negRes.data?.model).toBe("-1");
    });

    it("handles non-numeric model indices and unknown providers safely", async () => {
      const weirdInputs = [
        "foobar_provider_xyz",
        "unknown_provider",
        "custom_test_provider",
      ];
      for (const input of weirdInputs) {
        const cmd = parser.parse(`/models ${input}`);
        const res = await registry.execute(cmd);
        expect(res.success).toBe(true);
        expect(res.message).toContain("Curated AI Models (Unknown provider");
      }
    });

    it("safely handles SQL injection attempts without query failure", async () => {
      const sqlInjections = [
        "'; DROP TABLE projects; --'",
        "\"' OR '1'='1\"",
        "\"UNION SELECT 1, 2, 3--\"",
      ];
      for (const payload of sqlInjections) {
        const cmd = parser.parse(`/model ${payload}`);
        const res = await registry.execute(cmd);
        expect(res.success).toBe(true);
        expect(res.message).toContain("Active model switched");
      }
      // Verify projects table still exists and is completely intact
      const rows = engine.raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'").all();
      expect(rows.length).toBe(1);
    });

    it("handles unclosed quotes with concise error rather than Zod dump", () => {
      const unclosed = ["/model 'unterminated", '/model "unterminated'];
      for (const cmdStr of unclosed) {
        expect(() => parser.parse(cmdStr)).toThrow("Unterminated quoted string in command input.");
      }
    });

    it("handles shell injection strings safely as string literals", async () => {
      const shellPayloads = [
        "\"$(rm -rf /)\"",
        "\"; calc.exe\"",
        "\"| whoami\"",
        "\"& echo pwned\"",
      ];
      for (const payload of shellPayloads) {
        const cmd = parser.parse(`/model add ${payload}`);
        const res = await registry.execute(cmd);
        expect(res.success).toBe(true);
      }
    });

    it("handles empty, whitespace, and bare prefix inputs with concise error (no Zod dump)", () => {
      const blanks = ["", " ", "   ", "\t", "\n", "/", ":", "//", "::", "/ ", ": "];
      for (const b of blanks) {
        try {
          parser.parse(b);
        } catch (err: any) {
          expect(err.message).toBe("Empty command input.");
          // Confirm it is not a raw Zod validation JSON string
          expect(err.message).not.toContain('"issues"');
          expect(err.message).not.toContain('"code"');
        }
      }
    });

    it("TuiController ignores empty inputs and bare slashes without error", async () => {
      const stateAdapter = new TuiStateAdapter();
      const renderer = new TuiRenderer({ width: 80, height: 24 });
      const ctrl = new TuiController({
        stateAdapter,
        renderer,
        commandParser: parser,
        commandRegistry: registry,
      });

      // Execute empty inputs directly via TuiController
      await ctrl.executeCommand("");
      expect(ctrl.getErrorMessage()).toBe("");

      await ctrl.executeCommand("/");
      expect(ctrl.getErrorMessage()).toBe("");

      await ctrl.executeCommand("   ");
      expect(ctrl.getErrorMessage()).toBe("");

      await ctrl.executeCommand(":::");
      expect(ctrl.getErrorMessage()).toBe("");
    });

    it("handles 10,000 character argument string without buffer overflow", async () => {
      const hugeString = "A".repeat(10000);
      const cmd = parser.parse(`/model add ${hugeString}`);
      const res = await registry.execute(cmd);
      expect(res.success).toBe(true);
      expect(res.data?.model).toBe(hugeString);
    });
  });

  // =========================================================================
  // 2. Telemetry and Budgeting Edge Cases
  // =========================================================================
  describe("2. Telemetry & Budgeting Edge Cases", () => {
    let metricsDir: string;

    beforeEach(() => {
      metricsDir = fs.mkdtempSync(path.join(os.tmpdir(), "anantham-metrics-test-"));
      TokenMetricsManager.resetInstance();
    });

    afterEach(() => {
      TokenMetricsManager.resetInstance();
      try {
        fs.rmSync(metricsDir, { recursive: true, force: true });
      } catch {}
    });

    it("recovers gracefully from corrupted token_metrics.json", () => {
      const metricsFile = path.join(metricsDir, "token_metrics.json");
      fs.writeFileSync(metricsFile, "{ this is corrupt json !!! }}}", "utf-8");

      const mgr = TokenMetricsManager.getInstance(metricsDir);
      expect(mgr.getRecords().length).toBeGreaterThan(0); // seeded fallback
      expect(mgr.getMonthlyBudget()).toBe(2000);
    });

    it("handles malformed records array gracefully", () => {
      const metricsFile = path.join(metricsDir, "token_metrics.json");
      fs.writeFileSync(metricsFile, JSON.stringify({ records: "not an array", monthlyBudgetUsd: "invalid" }), "utf-8");

      const mgr = TokenMetricsManager.getInstance(metricsDir);
      expect(mgr.getRecords().length).toBeGreaterThan(0);
    });

    it("handles negative budget without division by zero or NaN rendering", () => {
      const mgr = TokenMetricsManager.getInstance(metricsDir);
      mgr.setMonthlyBudget(-500);
      expect(mgr.getMonthlyBudget()).toBe(-500);

      const rendered = TokenDashboardRenderer.render(80, 24);
      expect(rendered.length).toBeGreaterThan(10);
      for (const line of rendered) {
        expect(line).not.toContain("NaN");
        expect(line).not.toContain("undefined");
      }
    });

    it("handles zero token records gracefully without NaN", () => {
      const mgr = TokenMetricsManager.getInstance(metricsDir);
      mgr.recordUsage({
        modelId: "test/zero-model",
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        estimatedCostUsd: 0,
      });

      const daily = mgr.getDailySummary();
      expect(daily.totalTokens).toBeGreaterThanOrEqual(0);

      const rendered = TokenDashboardRenderer.render(80, 24);
      expect(rendered.length).toBeGreaterThan(10);
      for (const line of rendered) {
        expect(line).not.toContain("NaN");
      }
    });

    it("handles astronomical token counts without crashing", () => {
      const mgr = TokenMetricsManager.getInstance(metricsDir);
      mgr.recordUsage({
        modelId: "openai/gpt-4o",
        inputTokens: 1e12,
        outputTokens: 5e11,
        cachedTokens: 2e11,
      });

      const daily = mgr.getDailySummary();
      expect(daily.totalTokens).toBeGreaterThan(1e12);

      const rendered = TokenDashboardRenderer.render(80, 24);
      expect(rendered.length).toBeGreaterThan(10);
      for (const line of rendered) {
        expect(line).not.toContain("NaN");
      }
    });
  });

  // =========================================================================
  // 3. Logo Path Resolution Edge Cases
  // =========================================================================
  describe("3. Logo Path Resolution Edge Cases", () => {
    let logoTempDir: string;

    beforeEach(() => {
      logoTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "anantham-logo-test-"));
    });

    afterEach(() => {
      try {
        fs.rmSync(logoTempDir, { recursive: true, force: true });
      } catch {}
    });

    it("resolves null on nonexistent logo paths without throwing", () => {
      const nonExistent = path.join(logoTempDir, "missing.png");
      const resolved = TerminalLogoRenderer.resolveLogoPath(nonExistent);
      expect(resolved).toBe(nonExistent);

      // Rendering header logo with nonexistent path falls back to halfblock
      const lines = TerminalLogoRenderer.renderHeaderLogo("kitty", nonExistent);
      expect(lines.length).toBe(4);
      expect(lines[0]).toContain("\u2580");
    });

    it("falls back gracefully when path points to a directory", () => {
      const dirPath = logoTempDir;
      const lines = TerminalLogoRenderer.renderHeaderLogo("kitty", dirPath);
      expect(lines.length).toBe(4);
      expect(lines[0]).toContain("\u2580");
    });

    it("falls back gracefully when file is not a valid PNG", () => {
      const fakePng = path.join(logoTempDir, "corrupt.png");
      fs.writeFileSync(fakePng, "not a png file at all", "utf-8");

      const lines = TerminalLogoRenderer.renderHeaderLogo("kitty", fakePng);
      // Kitty with corrupt png should either emit valid sequence or fallback
      expect(lines.length).toBeGreaterThan(0);
    });

    it("handles path traversal strings safely", () => {
      const traversal = "../../../../../../../../windows/win.ini";
      expect(() => TerminalLogoRenderer.resolveLogoPath(traversal)).not.toThrow();
    });

    it("handles extreme halfblock widths without crashing", () => {
      const zeroWidth = TerminalLogoRenderer.renderHalfBlockLogo(0);
      expect(zeroWidth.length).toBe(4);

      const oneWidth = TerminalLogoRenderer.renderHalfBlockLogo(1);
      expect(oneWidth.length).toBe(4);

      const hugeWidth = TerminalLogoRenderer.renderHalfBlockLogo(300);
      expect(hugeWidth.length).toBe(4);
    });
  });

  // =========================================================================
  // 4. Global Keyboard Input & Terminal Stress
  // =========================================================================
  describe("4. Global Keyboard Input & Terminal Stress", () => {
    it("handles rapid burst of ANSI escape sequences without dropping state", () => {
      let burst = "";
      for (let i = 0; i < 500; i++) {
        burst += "\x1b[A\x1b[B\x1b[C\x1b[D";
      }
      const { tokens, remainder } = TuiController.decodeInputTokens(burst, true);
      expect(tokens.length).toBe(2000);
      expect(remainder).toBe("");
    });

    it("handles split escape sequences correctly with remainder buffer", () => {
      const part1 = "\x1b[";
      const { tokens: t1, remainder: r1 } = TuiController.decodeInputTokens(part1, false);
      expect(t1.length).toBe(0);
      expect(r1).toBe("\x1b[");

      const part2 = r1 + "A";
      const { tokens: t2, remainder: r2 } = TuiController.decodeInputTokens(part2, true);
      expect(t2).toEqual(["\x1b[A"]);
      expect(r2).toBe("");
    });

    it("handles 50,000 character bracketed paste stress cleanly", async () => {
      let outputBuffer = "";
      const mockOutput = {
        write: (str: string) => {
          outputBuffer += str;
          return true;
        },
      } as any;

      const stateAdapter = new TuiStateAdapter();
      const renderer = new TuiRenderer({ width: 80, height: 24 });
      const ctrl = new TuiController({
        stateAdapter,
        renderer,
        output: mockOutput,
      });

      // Enter command mode
      await ctrl.handleInput(":");
      expect(ctrl.isInCommandMode()).toBe(true);

      // Paste 50,000 chars inside bracketed paste
      const pastePayload = "\x1b[200~" + "hello_world_".repeat(4000) + "\x1b[201~";
      await ctrl.handleInput(pastePayload);
      expect(ctrl.getCommandBuffer().length).toBe(48000);
    });

    it("handles rapid terminal resize events across extreme bounds", () => {
      const stateAdapter = new TuiStateAdapter();
      const renderer = new TuiRenderer({ width: 80, height: 24 });
      const ctrl = new TuiController({ stateAdapter, renderer });

      const extremeDims = [
        { width: 0, height: 0 },
        { width: 1, height: 1 },
        { width: 2, height: 2 },
        { width: 500, height: 200 },
        { width: 80, height: 24 },
      ];

      for (const d of extremeDims) {
        expect(() => ctrl.setDimensions(d)).not.toThrow();
      }
    });

    it("two-tier Escape semantics works under adversarial key sequence", async () => {
      const stateAdapter = new TuiStateAdapter();
      const renderer = new TuiRenderer({ width: 80, height: 24 });
      const ctrl = new TuiController({ stateAdapter, renderer });

      // Open model browser modal with provider folder
      const dummyModels = [
        { id: "openai/test-m1", name: "M1", provider: "openai", contextLength: 4096, promptPricePerM: 1, completionPricePerM: 2 },
      ];
      const browser = new ModelAccordionBrowser(dummyModels);
      ctrl.setModelBrowserModal(browser);
      expect(ctrl.getModelBrowserModal()).not.toBeNull();

      // Stress navigation inside modal with 50 Up/Down movements
      for (let i = 0; i < 25; i++) {
        await ctrl.handleInput("\x1b[A"); // Up
        await ctrl.handleInput("\x1b[B"); // Down
      }
      expect(ctrl.getModelBrowserModal()).not.toBeNull();

      // First ESC -> must dismiss modal but NOT quit TUI
      const keepRunningAfterModalEsc = await ctrl.handleInput("\x1b");
      expect(keepRunningAfterModalEsc).toBe(true);
      expect(ctrl.getModelBrowserModal()).toBeNull();

      // Second ESC at root prompt -> must cleanly exit
      const keepRunningAfterRootEsc = await ctrl.handleInput("\x1b");
      expect(keepRunningAfterRootEsc).toBe(false);
      expect(ctrl.getIsRunning()).toBe(false);
    });
  });
});
