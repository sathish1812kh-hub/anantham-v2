import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { SessionController } from "../../src/cli/session-controller.js";
import { CommandRegistry } from "../../src/cli/command-registry.js";
import { CommandParser } from "../../src/cli/command-parser.js";

describe("P8.1 CLI — Command Registry & Dispatching", () => {
  let engine: SqliteEngine;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let taskRepo: TaskRepository;
  let controller: SessionController;
  let registry: CommandRegistry;
  let parser: CommandParser;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    projectRepo = new ProjectRepository(engine);
    sessionRepo = new SessionRepository(engine);
    taskRepo = new TaskRepository(engine);

    controller = new SessionController({ projectRepo, sessionRepo });
    registry = new CommandRegistry({
      sessionController: controller,
      projectRepo,
      taskRepo,
      engine,
    });
    parser = new CommandParser();
  });

  afterEach(() => {
    engine.close();
  });

  it("lists all registered built-in commands with /help", async () => {
    const cmd = parser.parse("/help");
    const res = await registry.execute(cmd);

    expect(res.success).toBe(true);
    expect(res.data).toBeDefined();
    expect(Array.isArray(res.data)).toBe(true);
    const list = res.data as Array<{ command: string }>;
    expect(list.some((c) => c.command === "/project")).toBe(true);
    expect(list.some((c) => c.command === "/session")).toBe(true);
    expect(list.some((c) => c.command === "/doctor")).toBe(true);
  });

  it("returns help for a specific command", async () => {
    const cmd = parser.parse("/help project");
    const res = await registry.execute(cmd);

    expect(res.success).toBe(true);
    expect(res.message).toContain("Command: /project");
  });

  it("handles unknown commands gracefully with actionable error", async () => {
    const cmd = parser.parse("/nonexistent_command");
    const res = await registry.execute(cmd);

    expect(res.success).toBe(false);
    expect(res.error).toContain("Unknown command");
  });

  it("handles /exit command and sets exitRequested flag", async () => {
    const cmd = parser.parse("/exit");
    const res = await registry.execute(cmd);

    expect(res.success).toBe(true);
    expect(res.exitRequested).toBe(true);
  });
});
