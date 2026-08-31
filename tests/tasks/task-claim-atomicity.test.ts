import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository, SessionRepository, TaskRepository, LeaseRepository } from "../../src/persistence/index.js";
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";
import { Task } from "../../src/domain/task.js";

describe("P6.2 Tasks — Task Claim Atomicity", () => {
  let db: SqliteEngine;
  let taskRepo: TaskRepository;
  let leaseRepo: LeaseRepository;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let claimManager: TaskClaimManager;

  beforeEach(() => {
    db = new SqliteEngine({ path: ":memory:" });
    db.open();
    const migrator = new MigrationEngine(db);
    migrator.migrate();

    projectRepo = new ProjectRepository(db);
    sessionRepo = new SessionRepository(db);
    taskRepo = new TaskRepository(db);
    leaseRepo = new LeaseRepository(db);

    claimManager = new TaskClaimManager({
      engine: db,
      taskRepo,
      leaseRepo,
    });

    projectRepo.save({
      id: "proj_claim",
      name: "Claim Project",
      rootPath: "C:/claim_proj",
      status: "active",
      tags: [],
      modelProfile: "m",
      memoryNamespace: "mem",
      orchestrationProfile: "o",
      trustProfile: "developer",
      createdAt: "2026-08-31T00:00:00.000Z",
      lastOpenedAt: "2026-08-31T00:00:00.000Z",
      lastActivityAt: "2026-08-31T00:00:00.000Z",
    });

    sessionRepo.save({
      id: "sess_claim",
      projectId: "proj_claim",
      name: "Claim Session",
      branch: "main",
      status: "active",
      modelProfile: "m",
      keyPoolProfile: "k",
      mode: "interactive",
      permissions: {},
      createdAt: "2026-08-31T00:00:00.000Z",
      updatedAt: "2026-08-31T00:00:00.000Z",
    });
  });

  afterEach(() => {
    db.close();
  });

  it("atomically creates a durable lease and updates task status to claimed with initial generation 1", () => {
    const task: Task = {
      id: "task_atom_01",
      projectId: "proj_claim",
      sessionId: "sess_claim",
      objective: "Atomic claim test",
      status: "queued",
      priority: "high",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: "2026-08-31T00:01:00.000Z",
      updatedAt: "2026-08-31T00:01:00.000Z",
    };
    taskRepo.save(task);

    const result = claimManager.claimTask({
      taskId: "task_atom_01",
      agentId: "agent_worker_1",
      instanceId: "inst_w1_01",
      projectId: "proj_claim",
      sessionId: "sess_claim",
      ttlMs: 45000,
    });

    expect(result.success).toBe(true);
    expect(result.lease).toBeDefined();
    expect(result.lease?.generation).toBe(1);
    expect(result.lease?.status).toBe("ACTIVE");
    expect(result.lease?.ttlMs).toBe(45000);

    const updatedTask = taskRepo.findById("task_atom_01");
    expect(updatedTask?.status).toBe("claimed");

    const savedLease = leaseRepo.findActiveByTaskId("task_atom_01");
    expect(savedLease?.id).toBe(result.lease?.id);
    expect(savedLease?.agentId).toBe("agent_worker_1");
  });

  it("rejects claim when task does not exist or dependencies are not met", () => {
    const unMetDepTask: Task = {
      id: "task_unmet",
      projectId: "proj_claim",
      sessionId: "sess_claim",
      objective: "Unmet dep task",
      status: "queued",
      priority: "normal",
      dependencies: ["missing_dep_99"],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: "2026-08-31T00:01:00.000Z",
      updatedAt: "2026-08-31T00:01:00.000Z",
    };
    taskRepo.save(unMetDepTask);

    const missingResult = claimManager.claimTask({
      taskId: "non_existent_task",
      agentId: "agent_1",
      instanceId: "inst_1",
      projectId: "proj_claim",
      sessionId: "sess_claim",
    });
    expect(missingResult.success).toBe(false);
    expect(missingResult.errorCode).toBe("TASK_NOT_FOUND");

    const depResult = claimManager.claimTask({
      taskId: "task_unmet",
      agentId: "agent_1",
      instanceId: "inst_1",
      projectId: "proj_claim",
      sessionId: "sess_claim",
    });
    expect(depResult.success).toBe(false);
    expect(depResult.errorCode).toBe("DEPENDENCIES_NOT_SATISFIED");
  });
});
