import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { ArtifactRepository } from "../../src/persistence/repositories/artifact-repository.js";
import { IdeAdapter } from "../../src/integrations/ide-adapter.js";

describe("P8.4 Integrations — IDE / Editor Protocol Adapter", () => {
  let engine: SqliteEngine;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let taskRepo: TaskRepository;
  let artifactRepo: ArtifactRepository;
  let ideAdapter: IdeAdapter;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    projectRepo = new ProjectRepository(engine);
    sessionRepo = new SessionRepository(engine);
    taskRepo = new TaskRepository(engine);
    artifactRepo = new ArtifactRepository(engine);

    projectRepo.save({
      id: "proj_ide",
      name: "IDE Project",
      rootPath: "/ide",
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
      id: "sess_ide",
      projectId: "proj_ide",
      name: "IDE Session",
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

    taskRepo.save({
      id: "task_ide_1",
      projectId: "proj_ide",
      sessionId: "sess_ide",
      objective: "Edit source code from IDE",
      status: "available",
      priority: "normal",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {},
    });

    ideAdapter = new IdeAdapter({
      projectRepo,
      sessionRepo,
      taskRepo,
      artifactRepo,
    });
  });

  afterEach(() => {
    engine.close();
  });

  it("handles diagnostics.get and tasks.list IDE messages", async () => {
    // Diagnostics
    const diagRes = await ideAdapter.handleMessage({
      requestId: "msg_01",
      method: "diagnostics.get",
      projectId: "proj_ide",
    });

    expect(diagRes.success).toBe(true);
    expect((diagRes.result as any).project).toBe("IDE Project");
    expect((diagRes.result as any).activeSessions).toBe(1);

    // Tasks list
    const taskRes = await ideAdapter.handleMessage({
      requestId: "msg_02",
      method: "tasks.list",
      projectId: "proj_ide",
      sessionId: "sess_ide",
    });

    expect(taskRes.success).toBe(true);
    expect(Array.isArray(taskRes.result)).toBe(true);
    expect((taskRes.result as any).length).toBe(1);
    expect((taskRes.result as any)[0].id).toBe("task_ide_1");
  });
});
