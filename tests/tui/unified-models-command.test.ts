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
import { ModelAccordionBrowser } from "../../src/tui/model-accordion-browser.js";
import { TuiSanitizer } from "../../src/tui/tui-sanitizer.js";

describe("PRD-TUI-002: Unified Model Command Architecture (/models & /model)", () => {
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
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "anantham-unified-models-test-"));
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

    renderer = new TuiRenderer({ dimensions: { width: 90, height: 26 } });
    UserConfigManager.getInstance(tempDir);
    ModelCatalogCache.resetInstance(tempDir);
  });

  afterEach(() => {
    engine.close();
    ModelCatalogCache.resetInstance();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Safe cleanup fallback
    }
  });

  describe("Alias Routing and Command Consolidation", () => {
    it("registers unified /models command with aliases ['model', 'm', 'model-list']", () => {
      const desc = commandRegistry.getDescriptor("models");
      expect(desc).toBeDefined();
      expect(desc!.name).toBe("models");
      expect(desc!.aliases).toContain("model");
      expect(desc!.aliases).toContain("m");
      expect(desc!.aliases).toContain("model-list");

      // Resolving via alias returns the same canonical descriptor
      const descAlias = commandRegistry.getDescriptor("model");
      expect(descAlias).toBeDefined();
      expect(descAlias!.name).toBe("models");

      const descM = commandRegistry.getDescriptor("m");
      expect(descM).toBeDefined();
      expect(descM!.name).toBe("models");
    });

    it("executes /models and /model through the unified command handler", async () => {
      const resModels = await commandRegistry.execute(parser.parse("/models"));
      expect(resModels.success).toBe(true);
      expect(resModels.commandName).toBe("models");
      expect(resModels.message).toContain("Curated AI Models");

      const resModel = await commandRegistry.execute(parser.parse("/model"));
      expect(resModel.success).toBe(true);
      expect(resModel.commandName).toBe("model");
      expect(resModel.message).toContain("Current active model:");
      expect(resModel.message).toContain("Quick switch: /model <number>");
    });
  });

  describe("Subcommands & Argument Routing", () => {
    it("switches active model via /model <modelId> and /models <modelId>", async () => {
      const targetId = "openrouter/anthropic/claude-3.5-sonnet";

      // 1. Switch via /model
      const res1 = await commandRegistry.execute(parser.parse(`/model ${targetId}`));
      expect(res1.success).toBe(true);
      expect(res1.message).toContain(`✔ Active model switched to '${targetId}'`);
      expect(UserConfigManager.getInstance().getDefaultModel()).toBe(targetId);

      // 2. Switch via /models
      const targetId2 = "deepseek/deepseek-r1";
      const res2 = await commandRegistry.execute(parser.parse(`/models ${targetId2}`));
      expect(res2.success).toBe(true);
      expect(res2.message).toContain(`✔ Active model switched to '${targetId2}'`);
      expect(UserConfigManager.getInstance().getDefaultModel()).toBe(targetId2);
    });

    it("switches active model via quick numeric selection /model <number> and /models <number>", async () => {
      // Model 1
      const res1 = await commandRegistry.execute(parser.parse("/model 1"));
      expect(res1.success).toBe(true);
      expect(res1.message).toContain("✔ Active model switched to");
      const model1 = UserConfigManager.getInstance().getDefaultModel();
      expect(model1).toBeTruthy();

      // Model 2 via /models alias
      const res2 = await commandRegistry.execute(parser.parse("/models 2"));
      expect(res2.success).toBe(true);
      expect(res2.message).toContain("✔ Active model switched to");
      const model2 = UserConfigManager.getInstance().getDefaultModel();
      expect(model2).toBeTruthy();
      expect(model2).not.toBe(model1);

      // Out of bounds numeric index returns clear error
      const resInvalid = await commandRegistry.execute(parser.parse("/model 9999"));
      expect(resInvalid.success).toBe(false);
      expect(resInvalid.error).toContain("Invalid model index [9999]");
    });

    it("adds and removes custom models via /model add and /model remove", async () => {
      const customId = "openrouter/qwen/qwen-2.5-coder-32b-instruct";

      // Add custom model
      const resAdd = await commandRegistry.execute(parser.parse(`/model add ${customId}`));
      expect(resAdd.success).toBe(true);
      expect(resAdd.message).toContain(`✔ Added custom model '${customId}'`);
      expect(UserConfigManager.getInstance().getCustomModels()).toContain(customId);
      expect(UserConfigManager.getInstance().getDefaultModel()).toBe(customId);

      // Verify custom model is displayed in /model output
      const resCheck = await commandRegistry.execute(parser.parse("/model"));
      expect(resCheck.message).toContain(customId);

      // Remove custom model
      const resRemove = await commandRegistry.execute(parser.parse(`/model remove ${customId}`));
      expect(resRemove.success).toBe(true);
      expect(resRemove.message).toContain(`✔ Removed custom model '${customId}'`);
      expect(UserConfigManager.getInstance().getCustomModels()).not.toContain(customId);

      // Removing again shows graceful feedback
      const resRemoveAgain = await commandRegistry.execute(parser.parse(`/model remove ${customId}`));
      expect(resRemoveAgain.success).toBe(true);
      expect(resRemoveAgain.message).toContain("was not in custom models list");
    });

    it("lists models filtered by provider via /models <provider>", async () => {
      const resAnthropic = await commandRegistry.execute(parser.parse("/models anthropic"));
      expect(resAnthropic.success).toBe(true);
      expect(resAnthropic.message).toContain("Models for [ANTHROPIC]:");
      expect(resAnthropic.message).toContain("claude-3-5-sonnet");

      const resOpenRouter = await commandRegistry.execute(parser.parse("/models openrouter"));
      expect(resOpenRouter.success).toBe(true);
      expect(resOpenRouter.message).toContain("Models for [OPENROUTER]:");
      expect(resOpenRouter.message).toContain("openrouter/deepseek/deepseek-r1");
    });

    it("lists all curated models via /models all", async () => {
      const resAll = await commandRegistry.execute(parser.parse("/models all"));
      expect(resAll.success).toBe(true);
      expect(resAll.message).toContain("Curated AI Models Catalog:");
      expect(resAll.message).toContain("[OPENROUTER]:");
      expect(resAll.message).toContain("[ANTHROPIC]:");
      expect(resAll.message).toContain("[OPENAI]:");
    });

    it("falls back gracefully to curated models when /models is invoked with unknown provider", async () => {
      const res = await commandRegistry.execute(parser.parse("/models some-unknown-provider"));
      expect(res.success).toBe(true);
      expect(res.message).toContain("Curated AI Models");
    });
  });

  describe("TUI Controller Interception & Modal Activation", () => {
    it("intercepts /models with 0 args in interactive TUI mode to launch ModelAccordionBrowser modal directly", async () => {
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
      expect(controller.getModelBrowserModal()).toBeNull();
      expect(controller.getCommandOutput()).toBeNull();

      // Execute bare /models command
      await controller.executeCommand("/models");
      expect(controller.getModelBrowserModal()).not.toBeNull();
      expect(controller.getModelBrowserModal()).toBeInstanceOf(ModelAccordionBrowser);
      // Zero duplicate view blocks: commandOutput must remain null
      expect(controller.getCommandOutput()).toBeNull();

      // Render frame contains modal
      controller.renderNow();
      const plain = TuiSanitizer.stripAnsi(outputData);
      expect(plain).toContain("OPENROUTER MODEL EXPLORER");
      expect(plain).toContain("COMMAND RESULT: /MODELS");

      controller.stop();
    });

    it("intercepts /model with 0 args in interactive TUI mode to launch ModelAccordionBrowser modal", async () => {
      const mockOutput = new Writable({ write(_chunk, _enc, cb) { cb(); } });
      const controller = new TuiController({
        stateAdapter,
        renderer,
        commandRegistry,
        commandParser: parser,
        output: mockOutput,
      });

      controller.start();
      await controller.executeCommand("/model");
      expect(controller.getModelBrowserModal()).not.toBeNull();
      expect(controller.getModelBrowserModal()).toBeInstanceOf(ModelAccordionBrowser);
      expect(controller.getCommandOutput()).toBeNull();

      controller.stop();
    });

    it("does NOT launch modal when /model is run with arguments; displays result in commandOutput", async () => {
      const mockOutput = new Writable({ write(_chunk, _enc, cb) { cb(); } });
      const controller = new TuiController({
        stateAdapter,
        renderer,
        commandRegistry,
        commandParser: parser,
        output: mockOutput,
      });

      controller.start();
      await controller.executeCommand("/model 1");
      expect(controller.getModelBrowserModal()).toBeNull();
      expect(controller.getCommandOutput()).not.toBeNull();
      expect(controller.getCommandOutput()!.title).toContain("COMMAND RESULT: /MODEL");

      controller.stop();
    });

    it("allows keyboard selection inside the opened ModelAccordionBrowser modal", async () => {
      const mockOutput = new Writable({ write(_chunk, _enc, cb) { cb(); } });
      const controller = new TuiController({
        stateAdapter,
        renderer,
        commandRegistry,
        commandParser: parser,
        output: mockOutput,
      });

      controller.start();
      await controller.executeCommand("/models");

      const modal = controller.getModelBrowserModal();
      expect(modal).not.toBeNull();

      // Expand provider folder and navigate to model
      modal!.expandAll();
      const rows = modal!.getVisibleRows();
      const modelIdx = rows.findIndex((r) => r.type === "model");
      expect(modelIdx).toBeGreaterThanOrEqual(0);
      const targetModel = rows[modelIdx] as { type: "model"; model: { id: string } };

      modal!.setSelectedIndex(modelIdx);

      // Press Enter to select
      await controller.handleInput("\r");

      // Modal should close on selection
      expect(controller.getModelBrowserModal()).toBeNull();
      // Active model should be updated
      expect(UserConfigManager.getInstance().getDefaultModel()).toBe(targetModel.model.id);

      controller.stop();
    });
  });
});
