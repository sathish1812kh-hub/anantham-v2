import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TuiController } from "../../src/tui/tui-controller.js";
import { TuiRenderer } from "../../src/tui/tui-renderer.js";
import { TuiStateAdapter } from "../../src/tui/tui-state-adapter.js";
import { CommandRegistry } from "../../src/cli/command-registry.js";
import { CommandParser } from "../../src/cli/command-parser.js";
import { SessionController } from "../../src/cli/session-controller.js";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { TuiSanitizer } from "../../src/tui/tui-sanitizer.js";
import { Writable } from "node:stream";

describe("Antigravity CLI Harness & TUI Integration", () => {
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
  let lastOutput = "";

  beforeEach(() => {
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

    renderer = new TuiRenderer({ dimensions: { width: 90, height: 26 } });

    const mockOutput = new Writable({
      write(chunk, _encoding, callback) {
        lastOutput = chunk.toString();
        callback();
      },
    });

    controller = new TuiController({
      stateAdapter,
      renderer,
      commandRegistry,
      commandParser: parser,
      output: mockOutput,
    });
    controller.start();
  });

  afterEach(() => {
    controller.stop();
    engine.close();
  });

  it("renders Antigravity header with serpent glyph and status pill", () => {
    controller.renderNow();
    const plain = TuiSanitizer.stripAnsi(lastOutput);
    expect(plain).toContain("ANANTHAM INFINITE TUI");
    expect(plain).toContain("[HARNESS: ONLINE | LATENCY: 18ms]");
    expect(plain).toContain("Antigravity Reactive Shell");
  });

  it("triggers command palette overlay on typing '/'", async () => {
    await controller.handleInput("/");
    expect(controller.isInCommandMode()).toBe(true);
    expect(controller.getCommandBuffer()).toBe("/");

    controller.renderNow();
    const plain = TuiSanitizer.stripAnsi(lastOutput);
    expect(plain).toContain("COMMAND PALETTE");
    expect(plain).toContain("/teamwork-preview");
    expect(plain).toContain("anantham:preview >");
  });

  it("navigates suggestions with Up/Down and completes with Tab", async () => {
    await controller.handleInput("/");
    // Down arrow moves to next item
    await controller.handleInput("\x1b[B");
    // Tab completes
    await controller.handleInput("\t");

    expect(controller.getCommandBuffer()).toContain("/usage");
  });

  it("switches to 'usage' view upon executing /usage", async () => {
    await controller.executeCommand("/usage");
    expect(controller.getCurrentView()).toBe("usage");

    controller.renderNow();
    const plain = TuiSanitizer.stripAnsi(lastOutput);
    expect(plain).toContain("ANANTHAM TOKEN USAGE MATRIX & FINANCIAL DASHBOARD");
    expect(plain).toContain("TODAY'S TOKENS");
  });

  it("switches to 'usage' view pressing 'u' in normal mode", async () => {
    await controller.handleInput("u");
    expect(controller.getCurrentView()).toBe("usage");
  });

  it("executes /teamwork-preview and displays online worker pool status", async () => {
    const result = await commandRegistry.execute(parser.parse("/teamwork-preview"));
    expect(result.success).toBe(true);
    expect(result.message).toContain("Teamwork Preview Harness Status: ONLINE");
    expect(result.message).toContain("Parallel Workers : 4");
  });

  it("clears viewport upon executing /clear", async () => {
    await controller.executeCommand("/help");
    controller.renderNow();
    expect(lastOutput).toContain("COMMAND RESULT: /HELP");

    await controller.executeCommand("/clear");
    controller.renderNow();
    expect(lastOutput).not.toContain("COMMAND RESULT: /HELP");
  });
});
