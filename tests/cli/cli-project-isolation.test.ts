import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { SessionController } from "../../src/cli/session-controller.js";
import { CommandRegistry } from "../../src/cli/command-registry.js";
import { CommandParser } from "../../src/cli/command-parser.js";

describe("P8.1 CLI — Cross-Project Tenant Isolation", () => {
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

    // Project Alpha
    projectRepo.save({
      id: "proj_alpha",
      name: "Alpha Corp",
      rootPath: "/alpha",
      status: "active",
      tags: [],
      modelProfile: "default",
      memoryNamespace: "default",
      orchestrationProfile: "default",
      trustProfile: "safe",
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      metadata: {},
    });

    sessionRepo.save({
      id: "sess_alpha_01",
      projectId: "proj_alpha",
      name: "Alpha Session",
      branch: "main",
      status: "active",
      modelProfile: "default",
      keyPoolProfile: "default",
      mode: "interactive",
      permissions: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {},
    });

    // Project Beta
    projectRepo.save({
      id: "proj_beta",
      name: "Beta Corp",
      rootPath: "/beta",
      status: "active",
      tags: [],
      modelProfile: "default",
      memoryNamespace: "default",
      orchestrationProfile: "default",
      trustProfile: "safe",
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      metadata: {},
    });

    sessionRepo.save({
      id: "sess_beta_01",
      projectId: "proj_beta",
      name: "Beta Session",
      branch: "main",
      status: "active",
      modelProfile: "default",
      keyPoolProfile: "default",
      mode: "interactive",
      permissions: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {},
    });

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

  it("filters sessions strictly to active project", async () => {
    await registry.execute(parser.parse("/project select proj_alpha"));

    const sessionsRes = await registry.execute(parser.parse("/session list"));
    expect(sessionsRes.success).toBe(true);
    const sessions = sessionsRes.data as any[];

    expect(sessions.length).toBe(1);
    expect(sessions[0].id).toBe("sess_alpha_01");
    expect(sessions.some((s) => s.id === "sess_beta_01")).toBe(false);
  });

  it("rejects attempt to switch to a session belonging to another project", async () => {
    await registry.execute(parser.parse("/project select proj_alpha"));

    const res = await registry.execute(parser.parse("/session select sess_beta_01"));
    expect(res.success).toBe(false);
    expect(res.error).toContain("Project boundary violation");
  });
});
