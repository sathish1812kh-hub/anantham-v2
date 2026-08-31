import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository, SessionRepository, TaskRepository, LeaseRepository } from "../../src/persistence/index.js";
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";
import { Task } from "../../src/domain/task.js";

describe("P6.2 Tasks — Claim Concurrency & Conflict Handling", () => {
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
      id: "proj_conc",
      name: "Concurrency Project",
      rootPath: "C:/conc_proj",
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
      id: "sess_conc",
      projectId: "proj_conc",
      name: "Concurrency Session",
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

  it("ensures exactly one winner and deterministic conflict failures when N agents race for the same task", () => {
    const task: Task = {
      id: "task_race_01",
      projectId: "proj_conc",
      sessionId: "sess_conc",
      objective: "Race condition test",
      status: "queued",
      priority: "critical",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: "2026-08-31T00:01:00.000Z",
      updatedAt: "2026-08-31T00:01:00.000Z",
    };
    taskRepo.save(task);

    const agents = ["agent_alpha", "agent_beta", "agent_gamma", "agent_delta", "agent_epsilon"];
    const results = agents.map((agentId) =>
      claimManager.claimTask({
        taskId: "task_race_01",
        agentId,
        instanceId: `inst_${agentId}`,
        projectId: "proj_conc",
        sessionId: "sess_conc",
      })
    );

    const successes = results.filter((r) => r.success);
    const conflicts = results.filter((r) => !r.success && (r.errorCode === "CLAIM_CONFLICT" || r.errorCode === "TASK_NOT_CLAIMABLE"));

    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(4);

    const winner = successes[0]?.lease?.agentId;
    expect(agents).toContain(winner);

    const currentLease = leaseRepo.findActiveByTaskId("task_race_01");
    expect(currentLease?.agentId).toBe(winner);
  });
});
