import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { CicdAdapter } from "../../src/integrations/cicd-adapter.js";
import { EventTypes } from "../../src/domain/event.js";

describe("P8.4 Integrations — CI/CD Adapter", () => {
  let engine: SqliteEngine;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let taskRepo: TaskRepository;
  let eventStore: EventStore;
  let cicdAdapter: CicdAdapter;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    projectRepo = new ProjectRepository(engine);
    sessionRepo = new SessionRepository(engine);
    taskRepo = new TaskRepository(engine);
    eventStore = new EventStore(engine);

    projectRepo.save({
      id: "proj_cicd",
      name: "CI/CD Project",
      rootPath: "/ci",
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

    cicdAdapter = new CicdAdapter({
      taskRepo,
      sessionRepo,
      eventStore,
    });
  });

  afterEach(() => {
    engine.close();
  });

  it("parses CI payload and creates runtime CI task and session", () => {
    const payload = cicdAdapter.parsePayload({
      pipelineId: "gh_run_88921",
      triggerType: "pull_request",
      branch: "feat/integrations",
      commitSha: "c0ffee123456789",
    });

    const task = cicdAdapter.triggerCiTask("proj_cicd", payload);

    expect(task.id).toMatch(/^task_ci_/);
    expect(task.projectId).toBe("proj_cicd");

    const sessions = sessionRepo.listByProject("proj_cicd");
    expect(sessions.length).toBe(1);
    expect(sessions[0]!.branch).toBe("feat/integrations");

    const events = eventStore.getEventsByProject("proj_cicd");
    expect(events.length).toBe(1);
    expect(events[0]!.type).toBe(EventTypes.INTEGRATION_CICD_TRIGGERED);
  });
});
