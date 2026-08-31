import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository, SessionRepository, TaskRepository, LeaseRepository } from "../../src/persistence/index.js";
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";
import { Task } from "../../src/domain/task.js";

describe("P6.2 Tasks — Lease Lifecycle", () => {
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
      id: "proj_life",
      name: "Lifecycle Project",
      rootPath: "C:/life_proj",
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
      id: "sess_life",
      projectId: "proj_life",
      name: "Lifecycle Session",
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

  it("transitions lease through complete lifecycle: claim -> heartbeat -> complete -> release", () => {
    const task: Task = {
      id: "task_life_01",
      projectId: "proj_life",
      sessionId: "sess_life",
      objective: "Full lifecycle test",
      status: "queued",
      priority: "normal",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: "2026-08-31T00:01:00.000Z",
      updatedAt: "2026-08-31T00:01:00.000Z",
    };
    taskRepo.save(task);

    // 1. Claim
    const claimRes = claimManager.claimTask({
      taskId: "task_life_01",
      agentId: "agent_runner",
      instanceId: "inst_run_01",
      projectId: "proj_life",
      sessionId: "sess_life",
      ttlMs: 30000,
    });
    expect(claimRes.success).toBe(true);
    const lease = claimRes.lease!;

    // 2. Heartbeat
    const hbRes = claimManager.heartbeat({
      leaseId: lease.id,
      agentId: "agent_runner",
      instanceId: "inst_run_01",
      generation: lease.generation,
      currentAction: "parsing_ast",
      lastTool: "filesystem.read",
    });
    expect(hbRes.success).toBe(true);
    expect(hbRes.lease?.renewalCount).toBe(1);

    // 3. Complete
    const completeRes = claimManager.completeTask(
      "task_life_01",
      lease.id,
      lease.generation,
      { output: "Success" }
    );
    expect(completeRes).toBe(true);

    const completedTask = taskRepo.findById("task_life_01");
    expect(completedTask?.status).toBe("completed");

    const releasedLease = leaseRepo.findById(lease.id);
    expect(releasedLease?.status).toBe("RELEASED");

    // 4. Verify no active lease remains
    const activeLease = leaseRepo.findActiveByTaskId("task_life_01");
    expect(activeLease).toBeNull();
  });
});
