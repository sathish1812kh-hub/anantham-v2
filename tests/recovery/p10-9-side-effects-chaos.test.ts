import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { LeaseRepository } from "../../src/persistence/repositories/lease-repository.js";
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";
import { CrashRecoveryEngine } from "../../src/recovery/crash-recovery-engine.js";
import { ToolGateway } from "../../src/tools/tool-gateway.js";
import { ToolRegistry } from "../../src/tools/tool-registry.js";
import { PolicyEngine } from "../../src/policy/policy-engine.js";

describe("P10.9 Side-Effects Chaos, Split-Brain & State Machine Suite", () => {
  let tempDir: string;
  let engine: SqliteEngine;
  let eventStore: EventStore;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let taskRepo: TaskRepository;
  let leaseRepo: LeaseRepository;
  let claimManager: TaskClaimManager;
  let recoveryEngine: CrashRecoveryEngine;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "anantham-p10-9-chaos-"));
    const dbPath = join(tempDir, "test.db");
    engine = new SqliteEngine({ path: dbPath });
    engine.open();

    const migrationEngine = new MigrationEngine(engine);
    migrationEngine.migrate();

    eventStore = new EventStore(engine);
    projectRepo = new ProjectRepository(engine);
    sessionRepo = new SessionRepository(engine);
    taskRepo = new TaskRepository(engine);
    leaseRepo = new LeaseRepository(engine);

    claimManager = new TaskClaimManager({ engine, taskRepo, leaseRepo, eventStore });
    recoveryEngine = new CrashRecoveryEngine({ engine, eventStore });

    const now = new Date().toISOString();
    projectRepo.save({
      id: "proj_chaos",
      name: "Chaos Project",
      rootPath: join(tempDir, "proj_chaos"),
      status: "active",
      tags: [],
      modelProfile: "default",
      memoryNamespace: "proj_chaos",
      orchestrationProfile: "default",
      trustProfile: "developer",
      createdAt: now,
      lastOpenedAt: now,
      lastActivityAt: now,
    });

    sessionRepo.save({
      id: "sess_chaos",
      projectId: "proj_chaos",
      name: "Chaos Session",
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
    rmSync(tempDir, { recursive: true, force: true });
  });

  // --- 1. Split-Brain Stale Generation Rejection ---
  it("Split-Brain Fencing: Stale worker generation cannot mutate state or complete task", async () => {
    const now = new Date().toISOString();
    taskRepo.save({
      id: "task_split",
      projectId: "proj_chaos",
      sessionId: "sess_chaos",
      objective: "Split-brain test",
      status: "queued",
      priority: "normal",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: now,
      updatedAt: now,
    });

    // Worker 1 claims at generation 1
    const claim1 = claimManager.claimTask({
      taskId: "task_split",
      agentId: "worker_old",
      instanceId: "inst_old",
      projectId: "proj_chaos",
      sessionId: "sess_chaos",
      ttlMs: 20,
    });
    expect(claim1.success).toBe(true);

    await new Promise((r) => setTimeout(r, 40));

    // Recovery runs and revokes/expires old lease
    await recoveryEngine.executeRecovery();

    // Worker 2 claims at generation 2
    const claim2 = claimManager.claimTask({
      taskId: "task_split",
      agentId: "worker_new",
      instanceId: "inst_new",
      projectId: "proj_chaos",
      sessionId: "sess_chaos",
      ttlMs: 60000,
    });
    expect(claim2.success).toBe(true);
    expect(claim2.lease?.generation).toBe(2);

    // Stale Worker 1 attempts to complete task with generation 1
    const completeOld = claimManager.completeTask({
      taskId: "task_split",
      leaseId: claim1.lease!.id,
      generation: 1,
      agentId: "worker_old",
    });
    expect(completeOld).toBe(false);

    // Task remains claimed by worker 2
    expect(taskRepo.findById("task_split")?.status).toBe("claimed");
  });

  // --- 2. Side-Effect In-Flight Interruption Idempotency ---
  it("Side-Effect Chaos: Replayed task recovery after partial failure resets cleanly", async () => {
    const past = new Date(Date.now() - 50000).toISOString();
    taskRepo.save({
      id: "task_interrupted",
      projectId: "proj_chaos",
      sessionId: "sess_chaos",
      objective: "Interrupted task",
      status: "running",
      priority: "high",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: past,
      updatedAt: past,
    });

    leaseRepo.save({
      id: "lease_interrupted",
      taskId: "task_interrupted",
      agentId: "agent_crashed",
      instanceId: "inst_crashed",
      projectId: "proj_chaos",
      sessionId: "sess_chaos",
      generation: 1,
      acquiredAt: past,
      expiresAt: past,
      lastHeartbeatAt: past,
      ttlMs: 1000,
      status: "ACTIVE",
      renewalCount: 0,
      maxRenewals: 3,
    });

    const recovery = await recoveryEngine.executeRecovery();
    expect(recovery.status).toBe("SUCCESS");
    expect(recovery.staleLeasesEvictedCount).toBe(1);

    const taskAfter = taskRepo.findById("task_interrupted");
    expect(taskAfter?.status).toBe("queued");
  });
});
