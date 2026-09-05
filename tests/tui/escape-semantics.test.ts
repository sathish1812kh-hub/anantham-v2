import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Writable } from "node:stream";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { SessionController } from "../../src/cli/session-controller.js";
import { CommandRegistry } from "../../src/cli/command-registry.js";
import { CommandParser } from "../../src/cli/command-parser.js";
import { TuiStateAdapter } from "../../src/tui/tui-state-adapter.js";
import { TuiRenderer } from "../../src/tui/tui-renderer.js";
import { TuiController } from "../../src/tui/tui-controller.js";
import { UserConfigManager } from "../../src/persistence/user-config-manager.js";
import { ModelCatalogCache } from "../../src/persistence/model-catalog-cache.js";

describe("PRD-TUI-003: Context-Aware Global Escape Semantics (Two-Tier)", () => {
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

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "anantham-escape-semantics-test-"));
    const dbPath = path.join(tempDir, "test.db");
    engine = new SqliteEngine({ path: dbPath });
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
    });
    parser = new CommandParser();

    stateAdapter = new TuiStateAdapter({
      projectRepo,
      sessionRepo,
      taskRepo,
    });

    renderer = new TuiRenderer({ dimensions: { width: 80, height: 24 } });
    UserConfigManager.getInstance(tempDir);
    ModelCatalogCache.resetInstance(tempDir);
  });

  afterEach(() => {
    engine.close();
    ModelCatalogCache.resetInstance();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Safe cleanup
    }
  });

  describe("Tier 1: Escape inside Model Accordion Browser Modal", () => {
    it("closes ModelAccordionBrowser modal on Escape and returns focus to root command dock", async () => {
      let outputData = "";
      const mockOutput = new Writable({
        write(chunk, _enc, cb) {
          outputData += chunk.toString();
          cb();
        },
      });

      const controller = new TuiController({
        stateAdapter,
        renderer,
        commandRegistry,
        commandParser: parser,
        output: mockOutput,
      });

      controller.start();
      expect(controller.getIsRunning()).toBe(true);

      // 1. Open model accordion modal via /models
      await controller.executeCommand("/models");
      expect(controller.getModelBrowserModal()).not.toBeNull();

      // 2. Press Escape (\u001B)
      const keepRunning = await controller.handleInput("\u001B");

      // Modal must be dismissed
      expect(controller.getModelBrowserModal()).toBeNull();
      // Application must continue running
      expect(keepRunning).toBe(true);
      expect(controller.getIsRunning()).toBe(true);

      // 3. Subsequent Escape at root prompt terminates application cleanly
      const terminate = await controller.handleInput("\u001B");
      expect(terminate).toBe(false);
      expect(controller.getIsRunning()).toBe(false);
    });

    it("handles Escape in modal via literal '\\x1b' and 'escape' token strings", async () => {
      const mockOutput = new Writable({ write(_c, _e, cb) { cb(); } });
      const controller = new TuiController({
        stateAdapter,
        renderer,
        commandRegistry,
        commandParser: parser,
        output: mockOutput,
      });

      controller.start();

      // Open modal
      await controller.openModelBrowserModal();
      expect(controller.getModelBrowserModal()).not.toBeNull();

      // Escape via \x1b
      const res = await controller.handleInput("\x1b");
      expect(res).toBe(true);
      expect(controller.getModelBrowserModal()).toBeNull();
      expect(controller.getIsRunning()).toBe(true);

      controller.stop();
    });

    it("handles two-stage Escape when searching inside ModelAccordionBrowser modal", async () => {
      const mockOutput = new Writable({ write(_c, _e, cb) { cb(); } });
      const controller = new TuiController({
        stateAdapter,
        renderer,
        commandRegistry,
        commandParser: parser,
        output: mockOutput,
      });

      controller.start();
      await controller.openModelBrowserModal();

      const modal = controller.getModelBrowserModal()!;
      expect(modal).not.toBeNull();

      // Enter search mode by typing '/'
      await controller.handleInput("/");
      // Type query
      await controller.handleInput("c");
      await controller.handleInput("l");
      await controller.handleInput("a");
      await controller.handleInput("u");

      // Stage 1: Escape cancels search mode but keeps modal open
      const res1 = await controller.handleInput("\u001B");
      expect(res1).toBe(true);
      expect(controller.getModelBrowserModal()).not.toBeNull(); // Modal remains open

      // Stage 2: Second Escape closes the modal
      const res2 = await controller.handleInput("\u001B");
      expect(res2).toBe(true);
      expect(controller.getModelBrowserModal()).toBeNull(); // Modal closed

      // Stage 3: Third Escape at root prompt terminates
      const res3 = await controller.handleInput("\u001B");
      expect(res3).toBe(false);
      expect(controller.getIsRunning()).toBe(false);
    });
  });

  describe("Tier 1: Escape inside Command Mode & Command Palette", () => {
    it("exits command mode and closes palette on Escape, keeping controller running", async () => {
      const mockOutput = new Writable({ write(_c, _e, cb) { cb(); } });
      const controller = new TuiController({
        stateAdapter,
        renderer,
        commandRegistry,
        commandParser: parser,
        output: mockOutput,
      });

      controller.start();

      // Enter command mode via ':'
      await controller.handleInput(":");
      expect(controller.isInCommandMode()).toBe(true);

      // Type some characters
      await controller.handleInput("m");
      await controller.handleInput("o");
      expect(controller.getCommandBuffer()).toBe("mo");

      // Escape exits command mode
      const keepRunning = await controller.handleInput("\u001B");
      expect(keepRunning).toBe(true);
      expect(controller.isInCommandMode()).toBe(false);
      expect(controller.getCommandBuffer()).toBe("");
      expect(controller.getSavedDraft()).toBe("mo");
      expect(controller.getIsRunning()).toBe(true);

      // Subsequent Escape at root terminates
      const terminate = await controller.handleInput("\u001B");
      expect(terminate).toBe(false);
      expect(controller.getIsRunning()).toBe(false);
    });

    it("closes floating command palette popover on Escape when typing '/'", async () => {
      const mockOutput = new Writable({ write(_c, _e, cb) { cb(); } });
      const controller = new TuiController({
        stateAdapter,
        renderer,
        commandRegistry,
        commandParser: parser,
        output: mockOutput,
      });

      controller.start();

      // Enter command mode with slash to activate palette
      await controller.handleInput("/");
      expect(controller.isInCommandMode()).toBe(true);
      expect(controller.getCommandBuffer()).toBe("/");

      // Escape dismisses palette and returns to normal mode
      const keepRunning = await controller.handleInput("\x1b");
      expect(keepRunning).toBe(true);
      expect(controller.isInCommandMode()).toBe(false);
      expect(controller.getIsRunning()).toBe(true);

      controller.stop();
    });
  });

  describe("Tier 1: Escape inside Command Output Modal", () => {
    it("dismisses command output modal on Escape and returns focus to root prompt", async () => {
      const mockOutput = new Writable({ write(_c, _e, cb) { cb(); } });
      const controller = new TuiController({
        stateAdapter,
        renderer,
        commandRegistry,
        commandParser: parser,
        output: mockOutput,
      });

      controller.start();

      // Execute /help to open commandOutput modal
      await controller.executeCommand("/help");
      expect(controller.getCommandOutput()).not.toBeNull();

      // Press Escape to dismiss output modal
      const keepRunning = await controller.handleInput("\u001B");
      expect(keepRunning).toBe(true);
      expect(controller.getCommandOutput()).toBeNull();
      expect(controller.getIsRunning()).toBe(true);

      // Press Escape again at root prompt to exit cleanly
      const terminate = await controller.handleInput("\u001B");
      expect(terminate).toBe(false);
      expect(controller.getIsRunning()).toBe(false);
    });
  });

  describe("Tier 2: Escape at Root Command Bar (Clean Exit)", () => {
    it("terminates cleanly and restores alternate buffer and cursor on root Escape", async () => {
      let outputData = "";
      const mockOutput = new Writable({
        write(chunk, _enc, cb) {
          outputData += chunk.toString();
          cb();
        },
      });

      const controller = new TuiController({
        stateAdapter,
        renderer,
        commandRegistry,
        commandParser: parser,
        output: mockOutput,
      });

      controller.start();
      expect(outputData).toContain("\x1b[?1049h"); // Alternate screen buffer active
      expect(outputData).toContain("\x1b[?25l");   // Cursor hidden

      outputData = "";

      // Send Escape at root normal prompt
      const keepRunning = await controller.handleInput("\u001B");

      expect(keepRunning).toBe(false);
      expect(controller.getIsRunning()).toBe(false);
      expect(outputData).toContain("\x1b[?1049l"); // Restores primary screen buffer
      expect(outputData).toContain("\x1b[?25h");   // Restores cursor visibility
    });

    it("treats 'q' as graceful exit at root command bar identical to Escape", async () => {
      let outputData = "";
      const mockOutput = new Writable({
        write(chunk, _enc, cb) {
          outputData += chunk.toString();
          cb();
        },
      });

      const controller = new TuiController({
        stateAdapter,
        renderer,
        commandRegistry,
        commandParser: parser,
        output: mockOutput,
      });

      controller.start();
      outputData = "";

      const keepRunning = await controller.handleInput("q");
      expect(keepRunning).toBe(false);
      expect(controller.getIsRunning()).toBe(false);
      expect(outputData).toContain("\x1b[?1049l\x1b[?25h");
    });
  });

  describe("Arrow Keys and Escape Sequence Protection", () => {
    it("safely swallows arrow keys and navigation escape sequences without premature termination", async () => {
      const mockOutput = new Writable({ write(_c, _e, cb) { cb(); } });
      const controller = new TuiController({
        stateAdapter,
        renderer,
        commandRegistry,
        commandParser: parser,
        output: mockOutput,
      });

      controller.start();

      // Navigation sequences that must NOT terminate
      const sequences = [
        "\x1b[A",     // Up
        "\x1b[B",     // Down
        "\x1b[C",     // Right
        "\x1b[D",     // Left
        "\x1bOA",     // SS3 Up
        "\x1bOB",     // SS3 Down
        "\x1b[H",     // Home
        "\x1b[F",     // End
        "\x1b[3~",    // Delete
        "\x1b[5~",    // PageUp
        "\x1b[6~",    // PageDown
        "\x1b[1;5A",  // Ctrl+Up
        "\x1b[1;5B",  // Ctrl+Down
        "\x1bOP",     // F1
      ];

      for (const seq of sequences) {
        const keepRunning = await controller.handleInput(seq);
        expect(keepRunning).toBe(true);
        expect(controller.getIsRunning()).toBe(true);
      }

      controller.stop();
    });
  });

  describe("Multi-Tier Sequential Escape Journey", () => {
    it("traverses full lifecycle: modal -> search -> cancel search -> close modal -> enter cmd -> cancel cmd -> root exit", async () => {
      let outputData = "";
      const mockOutput = new Writable({
        write(chunk, _enc, cb) {
          outputData += chunk.toString();
          cb();
        },
      });

      const controller = new TuiController({
        stateAdapter,
        renderer,
        commandRegistry,
        commandParser: parser,
        output: mockOutput,
      });

      controller.start();

      // 1. Open modal
      await controller.openModelBrowserModal();
      expect(controller.getModelBrowserModal()).not.toBeNull();

      // 2. Activate search
      await controller.handleInput("/");
      await controller.handleInput("g");
      await controller.handleInput("p");
      await controller.handleInput("t");

      // 3. Escape 1: cancel search inside modal
      expect(await controller.handleInput("\u001B")).toBe(true);
      expect(controller.getModelBrowserModal()).not.toBeNull();

      // 4. Escape 2: close modal
      expect(await controller.handleInput("\u001B")).toBe(true);
      expect(controller.getModelBrowserModal()).toBeNull();

      // 5. Enter command mode
      await controller.handleInput(":");
      expect(controller.isInCommandMode()).toBe(true);

      // 6. Escape 3: cancel command mode
      expect(await controller.handleInput("\u001B")).toBe(true);
      expect(controller.isInCommandMode()).toBe(false);

      // 7. Escape 4: root prompt clean termination
      outputData = "";
      expect(await controller.handleInput("\u001B")).toBe(false);
      expect(controller.getIsRunning()).toBe(false);
      expect(outputData).toContain("\x1b[?1049l\x1b[?25h");
    });
  });
});
