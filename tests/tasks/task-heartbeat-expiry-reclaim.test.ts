import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { LeaseRepository } from "../../src/persistence/repositories/lease-repository.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";

describe("W-P10.6-04: Task Heartbeat Expiry Reclaim", () => {
  let tempDir: string;
  let engine: SqliteEngine;
  let taskRepo: TaskRepository;
  let leaseRepo: LeaseRepository;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let claimManager: TaskClaimManager;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "anantham-hb-exp-"));
    const dbPath = join(tempDir, "test.db");
    engine = new SqliteEngine({ path: dbPath });
    engine.open();

    const migrationEngine = new MigrationEngine(engine);
    migrationEngine.migrate();

    taskRepo = new TaskRepository(engine);
    leaseRepo = new LeaseRepository(engine);
    projectRepo = new ProjectRepository(engine);
    sessionRepo = new SessionRepository(engine);

    claimManager = new TaskClaimManager({
      engine,
      taskRepo,
      leaseRepo,
    });
  });

  afterEach(() => {
    engine.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("resets task status to queued and allows immediate reclaim by another worker when heartbeat fails due to lease expiry", async () => {
    const now = new Date().toISOString();

    projectRepo.save({
      id: "proj_01",
      name: "Test Project",
      rootPath: tempDir,
      status: "active",
      tags: [],
      modelProfile: "claude-3-5-sonnet",
      memoryNamespace: "project/proj_01",
      orchestrationProfile: "default",
      trustProfile: "developer",
      createdAt: now,
      lastOpenedAt: now,
      lastActivityAt: now,
    });

    sessionRepo.save({
      id: "sess_01",
      projectId: "proj_01",
      name: "Test Session",
      branch: "main",
      status: "active",
      modelProfile: "claude-3-5-sonnet",
      keyPoolProfile: "default",
      mode: "interactive",
      permissions: { "filesystem:read": true },
      createdAt: now,
      updatedAt: now,
    });

    taskRepo.save({
      id: "task_01",
      sessionId: "sess_01",
      projectId: "proj_01",
      objective: "Work",
      status: "queued",
      priority: "high",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: now,
      updatedAt: now,
    });

    // Worker 1 claims task with short TTL (10ms)
    const claim1 = claimManager.claimTask({
      taskId: "task_01",
      agentId: "agent_1",
      instanceId: "inst_1",
      projectId: "proj_01",
      sessionId: "sess_01",
      ttlMs: 10,
    });
    expect(claim1.success).toBe(true);

    // Wait for lease to expire
    await new Promise((r) => setTimeout(r, 30));

    // Worker 1 attempts heartbeat after expiry
    const hbRes = claimManager.heartbeat({
      leaseId: claim1.lease!.id,
      agentId: "agent_1",
      instanceId: "inst_1",
      generation: claim1.lease!.generation,
    });
    expect(hbRes.success).toBe(false);
    expect(hbRes.errorCode).toBe("LEASE_EXPIRED");

    // Task must immediately be in queued state
    const task = taskRepo.findById("task_01");
    expect(task?.status).toBe("queued");

    // Worker 2 can now claim the task immediately without deadlock
    const claim2 = claimManager.claimTask({
      taskId: "task_01",
      agentId: "agent_2",
      instanceId: "inst_2",
      projectId: "proj_01",
      sessionId: "sess_01",
      ttlMs: 5000,
    });
    expect(claim2.success).toBe(true);
    expect(claim2.lease?.agentId).toBe("agent_2");
    expect(claim2.lease?.generation).toBe(2);
  });
});
