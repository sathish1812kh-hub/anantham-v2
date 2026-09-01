import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { LeaseRepository } from "../../src/persistence/repositories/lease-repository.js";
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { EventRepository } from "../../src/persistence/repositories/event-repository.js";

describe("W-02 Task Claim Race & TOCTOU Atomic Verification", () => {
  let engine: SqliteEngine;
  let taskRepo: TaskRepository;
  let leaseRepo: LeaseRepository;
  let eventStore: EventStore;
  let claimManager: TaskClaimManager;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    const projectRepo = new ProjectRepository(engine);
    const sessionRepo = new SessionRepository(engine);
    taskRepo = new TaskRepository(engine);
    leaseRepo = new LeaseRepository(engine);
    eventStore = new EventStore(engine, new EventRepository(engine));
    claimManager = new TaskClaimManager({
      engine,
      taskRepo,
      leaseRepo,
      eventStore,
    });

    const now = new Date().toISOString();
    projectRepo.save({
      id: "proj_1",
      name: "Test Project",
      rootPath: process.cwd(),
      status: "active",
      tags: [],
      modelProfile: "default",
      memoryNamespace: "default",
      orchestrationProfile: "default",
      trustProfile: "safe",
      createdAt: now,
      lastOpenedAt: now,
      lastActivityAt: now,
      metadata: {},
    });

    sessionRepo.save({
      id: "sess_1",
      projectId: "proj_1",
      name: "Main Session",
      branch: "main",
      status: "active",
      modelProfile: "default",
      keyPoolProfile: "default",
      mode: "interactive",
      permissions: {},
      createdAt: now,
      updatedAt: now,
      metadata: {},
    });
  });

  afterEach(() => {
    engine.close();
  });

  it("atomically rejects completeTask if lease was revoked concurrently before transaction execution", () => {
    taskRepo.save({
      id: "task_race_01",
      projectId: "proj_1",
      sessionId: "sess_1",
      objective: "Race Test",
      status: "queued",
      priority: "normal",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {},
    });

    const claimRes = claimManager.claimTask({
      taskId: "task_race_01",
      agentId: "agent_A",
      instanceId: "inst_A",
      projectId: "proj_1",
      sessionId: "sess_1",
      ttlMs: 5000,
    });

    expect(claimRes.success).toBe(true);
    const lease = claimRes.lease!;

    // Simulate concurrent lease revocation / expiration by another worker or recovery engine
    leaseRepo.updateStatus(lease.id, "EXPIRED");

    // Old worker attempts completion
    const completed = claimManager.completeTask({
      taskId: "task_race_01",
      leaseId: lease.id,
      generation: lease.generation,
      agentId: "agent_A",
    });

    expect(completed).toBe(false);
    // Task status remains claimed/not completed
    const task = taskRepo.findById("task_race_01");
    expect(task?.status).not.toBe("completed");
  });
});
