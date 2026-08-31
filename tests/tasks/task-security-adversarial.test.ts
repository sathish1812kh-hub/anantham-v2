import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository, SessionRepository, TaskRepository, LeaseRepository } from "../../src/persistence/index.js";
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";
import { Task } from "../../src/domain/task.js";

describe("P6.2 Tasks — Security & Adversarial Protection", () => {
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
      id: "proj_sec",
      name: "Security Project",
      rootPath: "C:/sec_proj",
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
      id: "sess_sec",
      projectId: "proj_sec",
      name: "Security Session",
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

  it("rejects forged lease IDs and forged generation tokens and impersonated caller attempts", () => {
    const task: Task = {
      id: "task_sec_01",
      projectId: "proj_sec",
      sessionId: "sess_sec",
      objective: "Security test",
      status: "queued",
      priority: "normal",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: "2026-08-31T00:01:00.000Z",
      updatedAt: "2026-08-31T00:01:00.000Z",
    };
    taskRepo.save(task);

    const claimRes = claimManager.claimTask({
      taskId: "task_sec_01",
      agentId: "legit_agent",
      instanceId: "inst_legit",
      projectId: "proj_sec",
      sessionId: "sess_sec",
      ttlMs: 30000,
    });
    expect(claimRes.success).toBe(true);
    const lease = claimRes.lease!;

    // 1. Attack: Forged lease ID
    const forgedLeaseHb = claimManager.heartbeat({
      leaseId: "forged_fake_lease_999",
      agentId: "legit_agent",
      instanceId: "inst_legit",
      generation: 1,
    });
    expect(forgedLeaseHb.success).toBe(false);
    expect(forgedLeaseHb.errorCode).toBe("LEASE_NOT_FOUND");

    // 2. Attack: Forged future generation token
    const forgedGenHb = claimManager.heartbeat({
      leaseId: lease.id,
      agentId: "legit_agent",
      instanceId: "inst_legit",
      generation: 999, // Fake generation
    });
    expect(forgedGenHb.success).toBe(false);
    expect(forgedGenHb.errorCode).toBe("FENCING_VIOLATION");

    // 3. Attack: Impersonating attacker agent attempting to complete task with victim's lease
    const attackerComplete = claimManager.completeTask(
      "task_sec_01",
      lease.id,
      lease.generation,
      { output: "Attacker payload" },
      "attacker_agent"
    );
    expect(attackerComplete).toBe(false);

    // 4. Valid completion by legitimate agent
    const legitComplete = claimManager.completeTask(
      "task_sec_01",
      lease.id,
      lease.generation,
      { output: "Legit payload" },
      "legit_agent"
    );
    expect(legitComplete).toBe(true);
  });
});
