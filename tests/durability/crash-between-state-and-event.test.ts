import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { LeaseRepository } from "../../src/persistence/repositories/lease-repository.js";
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";

describe("P9.2 Durability — Atomic Rollback on Event Append Failure", () => {
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
      id: "proj_atom_fail",
      name: "Atom Fail Test Project",
      rootPath: "/tmp/atom_fail",
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
      id: "sess_atom_fail",
      projectId: "proj_atom_fail",
      name: "Atom Fail Session",
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

  it("CRITICAL INVARIANT: Entire transaction aborts and rolls back if event store write fails", () => {
    const now = new Date().toISOString();

    taskRepo.save({
      id: "task_rollback_01",
      projectId: "proj_atom_fail",
      sessionId: "sess_atom_fail",
      objective: "Atomic rollback test",
      status: "available",
      priority: "normal",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: now,
      updatedAt: now,
    });

    // Mock eventStore.appendWithinTransaction to simulate failure (e.g. disk write failure)
    const origAppendInTx = eventStore.appendWithinTransaction.bind(eventStore);
    eventStore.appendWithinTransaction = () => {
      throw new Error("SIMULATED_DISK_IO_FAILURE_DURING_EVENT_APPEND");
    };

    // Attempt to claim task
    const claimRes = claimManager.claimTask({
      taskId: "task_rollback_01",
      agentId: "agent_fail",
      instanceId: "inst_fail",
      projectId: "proj_atom_fail",
      sessionId: "sess_atom_fail",
    });

    expect(claimRes.success).toBe(false);
    expect(claimRes.errorCode).toBe("TRANSACTION_ERROR");

    // CRITICAL PROOF: Task status MUST remain 'available' and lease MUST NOT exist
    const task = taskRepo.findById("task_rollback_01");
    expect(task?.status).toBe("available");

    const leases = leaseRepo.findActiveByTaskId("task_rollback_01");
    expect(leases).toBeNull();

    // Restore append
    eventStore.appendWithinTransaction = origAppendInTx;
  });
});
