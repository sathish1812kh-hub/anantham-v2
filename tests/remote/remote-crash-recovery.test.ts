import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { LeaseRepository } from "../../src/persistence/repositories/lease-repository.js";
import { NodeRepository } from "../../src/persistence/repositories/node-repository.js";
import { RemoteDispatchRepository } from "../../src/persistence/repositories/remote-dispatch-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";
import { NodeRegistry } from "../../src/remote/node-registry.js";
import { RemoteDispatchManager } from "../../src/remote/remote-dispatch-manager.js";
import { RemoteRecoveryReconciler } from "../../src/remote/remote-recovery-reconciler.js";

describe("P7.4 Remote Nodes — Crash Recovery & Reconciler", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "anantham-remote-rec-"));
    dbPath = path.join(tmpDir, "remote.db");
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("reconciles active remote dispatches across controller restarts, releasing orphaned leases safely", () => {
    // Process 1: Setup DB, register node, create dispatch, simulate crash
    {
      const engine1 = new SqliteEngine({ path: dbPath });
      engine1.open();
      const migrator1 = new MigrationEngine(engine1);
      migrator1.migrate();

      const projectRepo1 = new ProjectRepository(engine1);
      const sessionRepo1 = new SessionRepository(engine1);
      const taskRepo1 = new TaskRepository(engine1);
      const leaseRepo1 = new LeaseRepository(engine1);
      const nodeRepo1 = new NodeRepository(engine1);
      const dispatchRepo1 = new RemoteDispatchRepository(engine1);
      const eventStore1 = new EventStore(engine1);

      projectRepo1.save({
        id: "proj_rec",
        name: "Recovery Project",
        rootPath: "/test",
        status: "active",
        tags: [],
        modelProfile: "default",
        memoryNamespace: "default",
        orchestrationProfile: "default",
        trustProfile: "safe",
        createdAt: new Date().toISOString(),
        lastOpenedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        metadata: {},
      });

      sessionRepo1.save({
        id: "sess_rec",
        projectId: "proj_rec",
        name: "Recovery Session",
        branch: "main",
        status: "active",
        modelProfile: "default",
        keyPoolProfile: "default",
        mode: "interactive",
        permissions: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {},
      });

      taskRepo1.save({
        id: "task_rec_01",
        projectId: "proj_rec",
        sessionId: "sess_rec",
        objective: "Crash recovery task",
        status: "available",
        priority: "normal",
        dependencies: [],
        inputArtifacts: [],
        outputArtifacts: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {},
      });

      const claimMgr1 = new TaskClaimManager({
        engine: engine1,
        taskRepo: taskRepo1,
        leaseRepo: leaseRepo1,
        eventStore: eventStore1,
      });

      const nodeReg1 = new NodeRegistry({ nodeRepo: nodeRepo1, eventStore: eventStore1 });
      nodeReg1.registerNode({
        id: "node_rec_01",
        nodeVersion: "1.0.0",
        runtimeVersion: "2.0.0",
        endpointUrl: "https://rec-node:9000",
        capabilities: ["worker"],
        projectScope: ["proj_rec"],
      });

      const dispatchMgr1 = new RemoteDispatchManager({
        dispatchRepo: dispatchRepo1,
        taskRepo: taskRepo1,
        nodeRegistry: nodeReg1,
        claimManager: claimMgr1,
        eventStore: eventStore1,
      });

      dispatchMgr1.dispatchTask({
        taskId: "task_rec_01",
        agentId: "agent_rec",
        projectId: "proj_rec",
        sessionId: "sess_rec",
        requiredCapabilities: ["worker"],
      });

      engine1.close(); // Crash
    }

    // Process 2: Reopen DB and reconcile
    {
      const engine2 = new SqliteEngine({ path: dbPath });
      engine2.open();

      const taskRepo2 = new TaskRepository(engine2);
      const leaseRepo2 = new LeaseRepository(engine2);
      const nodeRepo2 = new NodeRepository(engine2);
      const dispatchRepo2 = new RemoteDispatchRepository(engine2);
      const eventStore2 = new EventStore(engine2);

      const claimMgr2 = new TaskClaimManager({
        engine: engine2,
        taskRepo: taskRepo2,
        leaseRepo: leaseRepo2,
        eventStore: eventStore2,
      });

      const reconciler = new RemoteRecoveryReconciler(dispatchRepo2, nodeRepo2, claimMgr2, eventStore2);
      const summaries = reconciler.reconcileActiveDispatches();

      expect(summaries).toHaveLength(1);
      expect(summaries[0]?.previousStatus).toBe("DISPATCHED");
      expect(summaries[0]?.newStatus).toBe("RECLAIMED");

      const dispatch = dispatchRepo2.findDispatchById(summaries[0]!.dispatchId);
      expect(dispatch?.status).toBe("RECLAIMED");

      const lease = leaseRepo2.findById(summaries[0]!.reclaimedLeaseId);
      expect(lease?.status).toBe("RELEASED");

      engine2.close();
    }
  });
});
