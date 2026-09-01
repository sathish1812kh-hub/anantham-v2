import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { SessionController } from "../../src/cli/session-controller.js";

describe("P8.1 CLI — Session Controller & Tenant Isolation", () => {
  let engine: SqliteEngine;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let controller: SessionController;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    projectRepo = new ProjectRepository(engine);
    sessionRepo = new SessionRepository(engine);

    // Project Alpha
    projectRepo.save({
      id: "proj_alpha",
      name: "Alpha Project",
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
      name: "Beta Project",
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

    controller = new SessionController({
      projectRepo,
      sessionRepo,
    });
  });

  afterEach(() => {
    engine.close();
  });

  it("selects active project and session within project boundaries", () => {
    controller.setActiveProject("proj_alpha");
    expect(controller.getContext().activeProjectId).toBe("proj_alpha");

    controller.setActiveSession("sess_alpha_01");
    expect(controller.getContext().activeSessionId).toBe("sess_alpha_01");
  });

  it("creates a new session within active project", () => {
    controller.setActiveProject("proj_alpha");
    const session = controller.createSession("New Sprint Session");

    expect(session.projectId).toBe("proj_alpha");
    expect(controller.getContext().activeSessionId).toBe(session.id);
  });

  it("strictly prohibits selecting a session belonging to another project", () => {
    controller.setActiveProject("proj_alpha");

    // Attempt to access Project Beta's session while active in Project Alpha
    expect(() => {
      controller.setActiveSession("sess_beta_01");
    }).toThrow("Project boundary violation");
  });
});
