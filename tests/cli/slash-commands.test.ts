import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { LeaseRepository } from "../../src/persistence/repositories/lease-repository.js";
import { ArtifactRepository } from "../../src/persistence/repositories/artifact-repository.js";
import { EventRepository } from "../../src/persistence/repositories/event-repository.js";
import { CheckpointRepository } from "../../src/persistence/repositories/checkpoint-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";
import { PolicyEngine } from "../../src/policy/policy-engine.js";
import { ToolRegistry } from "../../src/tools/tool-registry.js";
import { SessionResumeEngine } from "../../src/resume/session-resume-engine.js";
import { SessionController } from "../../src/cli/session-controller.js";
import { CommandRegistry } from "../../src/cli/command-registry.js";
import { CommandParser } from "../../src/cli/command-parser.js";

describe("P8.1 CLI — Built-in Slash Commands Suite", () => {
  let engine: SqliteEngine;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let taskRepo: TaskRepository;
  let leaseRepo: LeaseRepository;
  let artifactRepo: ArtifactRepository;
  let eventStore: EventStore;
  let claimManager: TaskClaimManager;
  let policyEngine: PolicyEngine;
  let toolRegistry: ToolRegistry;
  let resumeEngine: SessionResumeEngine;
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
    leaseRepo = new LeaseRepository(engine);
    artifactRepo = new ArtifactRepository(engine);
    const checkpointRepo = new CheckpointRepository(engine);
    const eventRepo = new EventRepository(engine);
    eventStore = new EventStore(engine);

    claimManager = new TaskClaimManager({
      engine,
      taskRepo,
      leaseRepo,
      eventStore,
    });

    policyEngine = new PolicyEngine();
    toolRegistry = new ToolRegistry();
    resumeEngine = new SessionResumeEngine({
      engine,
      projectRepo,
      sessionRepo,
      taskRepo,
      checkpointRepo,
      artifactRepo,
      eventRepo,
      eventStore,
    });

    controller = new SessionController({ projectRepo, sessionRepo });
    registry = new CommandRegistry({
      sessionController: controller,
      projectRepo,
      taskRepo,
      artifactRepo,
      eventStore,
      engine,
      resumeEngine,
      toolRegistry,
      policyEngine,
      claimManager,
    });
    parser = new CommandParser();
  });

  afterEach(() => {
    engine.close();
  });

  it("executes /project create, list, and select", async () => {
    // 1. Create project
    const createRes = await registry.execute(parser.parse('/project create "Web App"'));
    expect(createRes.success).toBe(true);
    expect(createRes.message).toContain("Created and selected project");

    // 2. List projects
    const listRes = await registry.execute(parser.parse("/project list"));
    expect(listRes.success).toBe(true);
    expect((listRes.data as any[]).length).toBe(1);
  });

  it("executes /session create, list, and info", async () => {
    await registry.execute(parser.parse('/project create "Project A"'));

    // 1. Create session
    const createRes = await registry.execute(parser.parse('/session create "Sprint 1"'));
    expect(createRes.success).toBe(true);

    // 2. Session info
    const infoRes = await registry.execute(parser.parse("/session info"));
    expect(infoRes.success).toBe(true);
    expect((infoRes.data as any).activeSessionId).toBeDefined();
  });

  it("executes /task create and list", async () => {
    await registry.execute(parser.parse('/project create "Project A"'));
    await registry.execute(parser.parse('/session create "Sprint 1"'));

    // 1. Create task
    const createRes = await registry.execute(parser.parse('/task create "Build frontend UI"'));
    expect(createRes.success).toBe(true);

    // 2. List tasks
    const listRes = await registry.execute(parser.parse("/task list"));
    expect(listRes.success).toBe(true);
    expect((listRes.data as any[]).length).toBe(1);
  });

  it("executes /doctor health check", async () => {
    const res = await registry.execute(parser.parse("/doctor"));
    expect(res.success).toBe(true);
    expect((res.data as any).sqliteWal).toBe("HEALTHY");
    expect((res.data as any).eventStore).toBe("OPERATIONAL");
  });

  it("executes /policy inspection", async () => {
    const res = await registry.execute(parser.parse("/policy"));
    expect(res.success).toBe(true);
    expect((res.data as any).status).toBe("ENFORCING");
  });
});
