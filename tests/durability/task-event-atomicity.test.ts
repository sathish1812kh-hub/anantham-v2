import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { LeaseRepository } from "../../src/persistence/repositories/lease-repository.js";
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";

describe("P9.2 Durability — Task State and Event Durability", () => {
  let engine: SqliteEngine;
  let eventStore: EventStore;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let taskRepo: TaskRepository;
  let leaseRepo: LeaseRepository;
  let claimManager: TaskClaimManager;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    eventStore = new EventStore(engine);
    projectRepo = new ProjectRepository(engine);
    sessionRepo = new SessionRepository(engine);
    taskRepo = new TaskRepository(engine);
    leaseRepo = new LeaseRepository(engine);
    claimManager = new TaskClaimManager({ engine, taskRepo, leaseRepo, eventStore });

    const now = new Date().toISOString();
    projectRepo.save({
      id: "proj_atom",
      name: "Atom Test Project",
      rootPath: "/tmp/atom",
      status: "active",
      tags: [],
      modelProfile: "default",
      memoryNamespace: "default",
      orchestrationProfile: "default",
      trustProfile: "safe",
      createdAt: now,

      lastOpenedAt: now,
      lastActivityAt: now,
    });

    sessionRepo.save({
      id: "sess_atom",
      projectId: "proj_atom",
      name: "Atom Session",
      branch: "main",
      status: "active",
      modelProfile: "default",
      keyPoolProfile: "default",
      mode: "interactive",
      permissions: {},
      createdAt: now,
      updatedAt: now,
    });
  });


  afterEach(() => {
    engine.close();
  });

  it("records task state transition and corresponding immutable event in EventStore", () => {
    const now = new Date().toISOString();

    taskRepo.save({
      id: "task_atom_01",
      projectId: "proj_atom",
      sessionId: "sess_atom",
      objective: "Atomic task test",
      status: "available",
      priority: "normal",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: now,
      updatedAt: now,
    });

    const claimRes = claimManager.claimTask({
      taskId: "task_atom_01",
      agentId: "agent_atom",
      instanceId: "inst_atom",
      projectId: "proj_atom",
      sessionId: "sess_atom",
    });

    expect(claimRes.success).toBe(true);

    // Complete task
    const compRes = claimManager.completeTask({
      taskId: "task_atom_01",
      leaseId: claimRes.lease!.id,
      generation: claimRes.lease!.generation,
      agentId: "agent_atom",
    });

    expect(compRes).toBe(true);

    // Verify task state in SQLite
    const task = taskRepo.findById("task_atom_01");
    expect(task?.status).toBe("completed");

    // Verify event exists in EventStore
    const events = eventStore.getEventsByProject("proj_atom");
    const completionEvents = events.filter((e) => e.type === "task.completed");
    expect(completionEvents.length).toBe(1);
    expect(completionEvents[0]!.taskId).toBe("task_atom_01");
  });
});
