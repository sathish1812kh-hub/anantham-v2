import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { LeaseRepository } from "../../src/persistence/repositories/lease-repository.js";
import { WebhookSubscriptionRepository } from "../../src/persistence/repositories/webhook-subscription-repository.js";
import { WebhookDeliveryRepository } from "../../src/persistence/repositories/webhook-delivery-repository.js";
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";
import { CrashRecoveryEngine } from "../../src/recovery/crash-recovery-engine.js";
import { WebhookDispatcher } from "../../src/integrations/webhook-dispatcher.js";
import { EventTypes } from "../../src/domain/event.js";

describe("P10.10 Production Chaos, Network Failures & Durability Suite", () => {
  let tempDir: string;
  let engine: SqliteEngine;
  let eventStore: EventStore;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let taskRepo: TaskRepository;
  let leaseRepo: LeaseRepository;
  let subRepo: WebhookSubscriptionRepository;
  let deliveryRepo: WebhookDeliveryRepository;
  let claimManager: TaskClaimManager;
  let recoveryEngine: CrashRecoveryEngine;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "anantham-p10-10-chaos-"));
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
    subRepo = new WebhookSubscriptionRepository(engine);
    deliveryRepo = new WebhookDeliveryRepository(engine);

    claimManager = new TaskClaimManager({ engine, taskRepo, leaseRepo, eventStore });
    recoveryEngine = new CrashRecoveryEngine({ engine, eventStore });

    const now = new Date().toISOString();
    projectRepo.save({
      id: "proj_live",
      name: "Live Project",
      rootPath: join(tempDir, "proj_live"),
      status: "active",
      tags: ["backup"],
      modelProfile: "default",
      memoryNamespace: "proj_live",
      orchestrationProfile: "default",
      trustProfile: "developer",
      createdAt: now,
      lastOpenedAt: now,
      lastActivityAt: now,
    });

    sessionRepo.save({
      id: "sess_live",
      projectId: "proj_live",
      name: "Live Session",
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

  // --- 1. Real Network TCP/HTTP Failure Harness ---
  it("Real Network Chaos: Webhook dispatcher gracefully handles socket drops and 500 errors", async () => {
    let requestCount = 0;
    const server: Server = createServer((req, res) => {
      requestCount++;
      if (requestCount === 1) {
        // Drop connection abruptly
        req.socket.destroy();
      } else {
        // Return 500 server error
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Chaos injected server error" }));
      }
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;
    const targetUrl = `http://127.0.0.1:${port}/webhook`;

    try {
      const dispatcher = new WebhookDispatcher({
        eventStore,
        subscriptionRepo: subRepo,
        deliveryRepo: deliveryRepo,
      });

      const now = new Date().toISOString();
      // Save subscription
      subRepo.save({
        id: "sub_chaos_1",
        projectId: "proj_live",
        targetUrl: targetUrl,
        events: [EventTypes.TASK_COMPLETED],
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      });

      // Trigger webhook dispatch via event
      const res1 = await (dispatcher as any).dispatchToSubscription(
        {
          id: "sub_chaos_1",
          projectId: "proj_live",
          targetUrl: targetUrl,
          events: [EventTypes.TASK_COMPLETED],
          status: "ACTIVE",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "evt_chaos_1",
          schemaVersion: 1,
          projectId: "proj_live",
          type: EventTypes.TASK_COMPLETED,
          timestamp: now,
          actor: { id: "system", type: "system" },
          payload: { taskId: "task_1" },
        }
      );

      expect(res1.status).toBe("FAILED");

      // Second attempt (returns 500)
      const res2 = await (dispatcher as any).dispatchToSubscription(
        {
          id: "sub_chaos_1",
          projectId: "proj_live",
          targetUrl: targetUrl,
          events: [EventTypes.TASK_COMPLETED],
          status: "ACTIVE",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "evt_chaos_2",
          schemaVersion: 1,
          projectId: "proj_live",
          type: EventTypes.TASK_COMPLETED,
          timestamp: now,
          actor: { id: "system", type: "system" },
          payload: { taskId: "task_1" },
        }
      );

      expect(res2.status).toBe("FAILED");
      expect(res2.statusCode).toBe(500);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // --- 2. Online Hot Backup & Point-in-Time Restore Verification ---
  it("Hot Backup & Durability: Live VACUUM INTO creates verifiable point-in-time backup", () => {
    const now = new Date().toISOString();
    taskRepo.save({
      id: "task_live",
      projectId: "proj_live",
      sessionId: "sess_live",
      objective: "Live active task",
      status: "running",
      priority: "critical",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: now,
      updatedAt: now,
    });

    const backupPath = join(tempDir, "backup-live.db");

    // Perform live hot backup
    engine.backup(backupPath);
    expect(existsSync(backupPath)).toBe(true);

    // Perform WAL checkpoint
    engine.checkpoint("TRUNCATE");

    // Open backup database in clean isolated engine
    const backupEngine = new SqliteEngine({ path: backupPath });
    backupEngine.open();

    const integrity = backupEngine.integrityCheck();
    expect(integrity.ok).toBe(true);

    const fkCheck = backupEngine.foreignKeyCheck();
    expect(fkCheck.ok).toBe(true);

    const restoredProjectRepo = new ProjectRepository(backupEngine);
    const restoredTaskRepo = new TaskRepository(backupEngine);

    const proj = restoredProjectRepo.findById("proj_live");
    expect(proj).toBeDefined();
    expect(proj?.name).toBe("Live Project");

    const task = restoredTaskRepo.findById("task_live");
    expect(task).toBeDefined();
    expect(task?.status).toBe("running");

    backupEngine.close();
  });

  // --- 3. 100-Cycle Repeated Crash Recovery Campaign ---
  it("Recovery Campaign: 100 consecutive crash recovery cycles maintain strict invariant stability", async () => {
    for (let i = 0; i < 100; i++) {
      const past = new Date(Date.now() - 50000).toISOString();
      const taskId = `task_cycle_${i}`;
      const leaseId = `lease_cycle_${i}`;

      taskRepo.save({
        id: taskId,
        projectId: "proj_live",
        sessionId: "sess_live",
        objective: `Cycle task ${i}`,
        status: "running",
        priority: "normal",
        dependencies: [],
        inputArtifacts: [],
        outputArtifacts: [],
        createdAt: past,
        updatedAt: past,
      });

      leaseRepo.save({
        id: leaseId,
        taskId: taskId,
        agentId: `agent_${i}`,
        instanceId: `inst_${i}`,
        projectId: "proj_live",
        sessionId: "sess_live",
        generation: 1,
        acquiredAt: past,
        expiresAt: past,
        lastHeartbeatAt: past,
        ttlMs: 500,
        status: "ACTIVE",
        renewalCount: 0,
        maxRenewals: 3,
      });

      const recovery = await recoveryEngine.executeRecovery();
      expect(recovery.status).toBe("SUCCESS");
      expect(recovery.staleLeasesEvictedCount).toBe(1);

      const task = taskRepo.findById(taskId);
      expect(task?.status).toBe("queued");
    }
  });
});
