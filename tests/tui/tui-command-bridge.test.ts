import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { SessionController } from "../../src/cli/session-controller.js";
import { CommandRegistry } from "../../src/cli/command-registry.js";
import { CommandParser } from "../../src/cli/command-parser.js";
import { CliErrorHandler } from "../../src/cli/error-handler.js";
import { TuiStateAdapter } from "../../src/tui/tui-state-adapter.js";
import { TuiRenderer } from "../../src/tui/tui-renderer.js";
import { TuiController } from "../../src/tui/tui-controller.js";

describe("P8.2 TUI — Command Bar Bridge to CommandRegistry", () => {
  let engine: SqliteEngine;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let taskRepo: TaskRepository;
  let sessionController: SessionController;
  let commandRegistry: CommandRegistry;
  let parser: CommandParser;
  let errorHandler: CliErrorHandler;
  let adapter: TuiStateAdapter;
  let renderer: TuiRenderer;
  let controller: TuiController;

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
    errorHandler = new CliErrorHandler();

    adapter = new TuiStateAdapter({ projectRepo, sessionRepo, taskRepo });
    renderer = new TuiRenderer();
    controller = new TuiController({
      stateAdapter: adapter,
      renderer,
      commandRegistry,
      commandParser: parser,
      errorHandler,
      coalesceIntervalMs: 0,
    });
    controller.start();
  });

  afterEach(() => {
    controller.stop();
    adapter.destroy();
    engine.close();
  });

  it("enters command mode on '/' and executes project create command", async () => {
    // 1. Enter command mode
    await controller.handleInput("/");

    // 2. Type: project create "Bridge App"
    const cmdStr = 'project create "Bridge App"';
    for (const ch of cmdStr) {
      await controller.handleInput(ch);
    }

    // 3. Submit
    await controller.handleInput("\n");

    const projects = projectRepo.list();
    expect(projects.length).toBe(1);
    expect(projects[0]!.name).toBe("Bridge App");
  });
});
