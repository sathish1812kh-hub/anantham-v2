import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TuiController } from "../../src/tui/tui-controller.js";
import { TuiRenderer } from "../../src/tui/tui-renderer.js";
import { TuiStateAdapter } from "../../src/tui/tui-state-adapter.js";
import { CommandRegistry } from "../../src/cli/command-registry.js";
import { CommandParser } from "../../src/cli/command-parser.js";
import { SessionController } from "../../src/cli/session-controller.js";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { UserConfigManager } from "../../src/persistence/user-config-manager.js";
import { ModelCatalogCache } from "../../src/persistence/model-catalog-cache.js";
import { Writable } from "node:stream";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("TUI Alternate Screen Buffer & OpenCode-Parity Command Output", () => {
  const originalFetch = globalThis.fetch;
  let engine: SqliteEngine;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let taskRepo: TaskRepository;
  let sessionController: SessionController;
  let commandRegistry: CommandRegistry;
  let parser: CommandParser;
  let stateAdapter: TuiStateAdapter;
  let renderer: TuiRenderer;
  let testOutputDir: string;

  beforeEach(() => {
    testOutputDir = path.join(os.tmpdir(), `anantham-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    fs.mkdirSync(testOutputDir, { recursive: true });

    UserConfigManager.resetInstance();
    UserConfigManager.getInstance(testOutputDir);

    ModelCatalogCache.resetInstance();
    ModelCatalogCache.getInstance(testOutputDir);

    globalThis.fetch = vi.fn().mockImplementation(async (url: any) => {
      if (typeof url === "string" && url.includes("/api/v1/auth/key")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              label: "Test OpenRouter Key",
              limit: 100,
              usage: 0.1234,
              is_free_tier: false,
            },
          }),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      } as unknown as Response;
    });

    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();

    // Create minimal schema
    engine.raw.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL,
        status TEXT NOT NULL,
        tags TEXT NOT NULL,
        model_profile TEXT NOT NULL,
        memory_namespace TEXT NOT NULL,
        orchestration_profile TEXT NOT NULL,
        trust_profile TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_opened_at TEXT NOT NULL,
        last_activity_at TEXT NOT NULL,
        metadata TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_activity_at TEXT NOT NULL,
        metadata TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        objective TEXT NOT NULL,
        status TEXT NOT NULL,
        priority TEXT NOT NULL,
        dependencies TEXT NOT NULL,
        input_artifacts TEXT NOT NULL,
        output_artifacts TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata TEXT NOT NULL
      );
    `);

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
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    UserConfigManager.resetInstance();
    ModelCatalogCache.resetInstance();
    engine.close();
    try {
      fs.rmSync(testOutputDir, { recursive: true, force: true });
    } catch {}
  });

  it("emits ANSI alternate screen buffer sequences on start and stop", () => {
    let outputData = "";
    const mockOutput = new Writable({
      write(chunk, _encoding, callback) {
        outputData += chunk.toString();
        callback();
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
    expect(outputData).toContain("\x1b[?1049h"); // Enter alternate screen buffer
    expect(outputData).toContain("\x1b[?25l");  // Hide cursor

    outputData = "";
    controller.stop();
    expect(outputData).toContain("\x1b[?1049l"); // Restore primary screen buffer
    expect(outputData).toContain("\x1b[?25h");  // Show cursor
  });

  it("renders frame at home position without trailing newline", () => {
    let lastFrame = "";
    const mockOutput = new Writable({
      write(chunk, _encoding, callback) {
        lastFrame = chunk.toString();
        callback();
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
    expect(lastFrame.startsWith("\x1b[H")).toBe(true);
    expect(lastFrame.endsWith("\n")).toBe(false); // No trailing newline to cause scroll leakage!
    controller.stop();
  });

  it("renders command output modal upon executing /help", async () => {
    let lastRender = "";
    const mockOutput = new Writable({
      write(chunk, _encoding, callback) {
        lastRender = chunk.toString();
        callback();
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

    // Execute /help
    await controller.executeCommand("/help");
    controller.renderNow();

    expect(lastRender).toContain("COMMAND RESULT: /HELP");
    expect(lastRender).toContain("Available Anantham V2 Commands");
    expect(lastRender).toContain("/project");
    expect(lastRender).toContain("Press [c] or [ESC] or [1-9] to dismiss output");

    // Press 'c' to dismiss
    await controller.handleInput("c");
    controller.renderNow();
    expect(lastRender).not.toContain("COMMAND RESULT: /HELP");

    controller.stop();
  });

  it("persists API keys and displays them via /key list and /connect", async () => {
    const configMgr = UserConfigManager.getInstance(testOutputDir);

    // Set openrouter key
    const resSet = await commandRegistry.execute(parser.parse("/key set openrouter sk-or-v1-testkey12345678"));
    expect(resSet.success).toBe(true);
    expect(resSet.message).toContain("✔ API key for provider 'openrouter' connected successfully!");
    expect(process.env.OPENROUTER_API_KEY).toBe("sk-or-v1-testkey12345678");

    // Verify /key list
    const resList = await commandRegistry.execute(parser.parse("/key list"));
    expect(resList.success).toBe(true);
    expect(resList.message).toContain("openrouter");
    expect(resList.message).toContain("Configured");

    // Verify /connect alias
    const resConnect = await commandRegistry.execute(parser.parse("/connect anthropic sk-ant-test987654321"));
    expect(resConnect.success).toBe(true);
    expect(process.env.ANTHROPIC_API_KEY).toBe("sk-ant-test987654321");

    // Clean up
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("lists curated models via /models and switches active model via /model", async () => {
    const resModels = await commandRegistry.execute(parser.parse("/models"));
    expect(resModels.success).toBe(true);
    expect(resModels.message).toContain("claude-3.5-sonnet");

    const resSpecific = await commandRegistry.execute(parser.parse("/models openrouter"));
    expect(resSpecific.success).toBe(true);
    expect(resSpecific.message).toContain("openrouter/deepseek/deepseek-r1");

    const resSwitch = await commandRegistry.execute(parser.parse("/model openrouter/anthropic/claude-3.5-sonnet"));
    expect(resSwitch.success).toBe(true);
    expect(resSwitch.message).toContain("✔ Active model switched to 'openrouter/anthropic/claude-3.5-sonnet'");

    const resCheck = await commandRegistry.execute(parser.parse("/model"));
    expect(resCheck.success).toBe(true);
    expect(resCheck.message).toContain("openrouter/anthropic/claude-3.5-sonnet");
  });

  it("supports quick numeric model selection via /model <number>", async () => {
    // Select model 2
    const res2 = await commandRegistry.execute(parser.parse("/model 2"));
    expect(res2.success).toBe(true);
    expect(res2.message).toContain("✔ Active model switched to");

    // Select model 1
    const res1 = await commandRegistry.execute(parser.parse("/model 1"));
    expect(res1.success).toBe(true);
    expect(res1.message).toContain("✔ Active model switched to");

    // Verify invalid number returns error result
    const resInvalid = await commandRegistry.execute(parser.parse("/model 999"));
    expect(resInvalid.success).toBe(false);
    expect(resInvalid.error).toContain("Invalid model index [999]");
  });

  it("supports adding and removing custom models via /model add and /model remove", async () => {
    const customId = "openrouter/mistralai/mistral-large-2407";
    const resAdd = await commandRegistry.execute(parser.parse(`/model add ${customId}`));
    expect(resAdd.success).toBe(true);
    expect(resAdd.message).toContain("Added custom model");

    const resCheck = await commandRegistry.execute(parser.parse("/model"));
    expect(resCheck.message).toContain(customId);

    const resRemove = await commandRegistry.execute(parser.parse(`/model remove ${customId}`));
    expect(resRemove.success).toBe(true);
    expect(resRemove.message).toContain("Removed custom model");
  });

  it("prioritizes configured providers when displaying /models", async () => {
    // Connect openrouter key
    const resKey = await commandRegistry.execute(parser.parse("/key set openrouter sk-or-test-detection-key"));
    expect(resKey.success).toBe(true);

    const resModels = await commandRegistry.execute(parser.parse("/models"));
    expect(resModels.success).toBe(true);
    expect(resModels.message).toContain("Available Models for Configured Providers");
    expect(resModels.message).toContain("OPENROUTER");
    expect(resModels.message).toContain("[1]");
    expect(resModels.message).toContain("openrouter/anthropic/claude-3.5-sonnet");

    // Clean up
    await commandRegistry.execute(parser.parse("/key remove openrouter"));
  });
});
