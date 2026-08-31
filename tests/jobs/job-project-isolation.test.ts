import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { LeaseRepository } from "../../src/persistence/repositories/lease-repository.js";
import { JobRepository } from "../../src/persistence/repositories/job-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";
import { BackgroundJobManager } from "../../src/jobs/background-job-manager.js";

describe("P7.3 Background Job — Project Isolation", () => {
  let engine: SqliteEngine;
  let jobRepo: JobRepository;
  let taskRepo: TaskRepository;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let leaseRepo: LeaseRepository;
  let eventStore: EventStore;
  let claimManager: TaskClaimManager;
  let jobManager: BackgroundJobManager;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    projectRepo = new ProjectRepository(engine);
    sessionRepo = new SessionRepository(engine);
    taskRepo = new TaskRepository(engine);
    leaseRepo = new LeaseRepository(engine);
    jobRepo = new JobRepository(engine);
    eventStore = new EventStore(engine);

    // Project A
    projectRepo.save({
      id: "proj_A",
      name: "Project A",
      rootPath: "/testA",
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
      id: "sess_A",
      projectId: "proj_A",
      name: "Session A",
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

    // Project B
    projectRepo.save({
      id: "proj_B",
      name: "Project B",
      rootPath: "/testB",
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
      id: "sess_B",
      projectId: "proj_B",
      name: "Session B",
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

    claimManager = new TaskClaimManager({
      engine,
      taskRepo,
      leaseRepo,
      eventStore,
    });

    jobManager = new BackgroundJobManager({
      jobRepo,
      taskRepo,
      projectRepo,
      sessionRepo,
      claimManager,
      eventStore,
    });
  });

  afterEach(() => {
    engine.close();
  });

  it("blocks worker in Project B from claiming or mutating a job belonging to Project A", () => {
    // Create job in Project A
    const jobA = jobManager.createJob({
      projectId: "proj_A",
      sessionId: "sess_A",
      objective: "Project A job",
      agentId: "agent_A",
    });

    // Attempt to claim jobA with Project B context
    expect(() => {
      claimManager.claimTask({
        taskId: jobA.taskId,
        agentId: "agent_B",
        instanceId: "inst_B",
        projectId: "proj_B", // Cross-project mismatch!
        sessionId: "sess_B",
      });
    }).not.toThrow();

    const crossClaim = claimManager.claimTask({
      taskId: jobA.taskId,
      agentId: "agent_B",
      instanceId: "inst_B",
      projectId: "proj_B",
      sessionId: "sess_B",
    });

    expect(crossClaim.success).toBe(false);
    expect(crossClaim.errorCode).toBe("PROJECT_ISOLATION_VIOLATION");
  });
});
