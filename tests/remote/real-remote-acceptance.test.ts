import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
import { RemoteNodeClient } from "../../src/remote/remote-node-client.js";

describe("P7.4 Real Multi-Node Remote Acceptance — End-to-End Test Suite", () => {
  let engine: SqliteEngine;
  let taskRepo: TaskRepository;
  let leaseRepo: LeaseRepository;
  let nodeRepo: NodeRepository;
  let dispatchRepo: RemoteDispatchRepository;
  let eventStore: EventStore;
  let claimManager: TaskClaimManager;
  let nodeRegistry: NodeRegistry;
  let dispatchManager: RemoteDispatchManager;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    const projectRepo = new ProjectRepository(engine);
    const sessionRepo = new SessionRepository(engine);
    taskRepo = new TaskRepository(engine);
    leaseRepo = new LeaseRepository(engine);
    nodeRepo = new NodeRepository(engine);
    dispatchRepo = new RemoteDispatchRepository(engine);
    eventStore = new EventStore(engine);

    projectRepo.save({
      id: "proj_acc",
      name: "Acceptance Project",
      rootPath: "/acc",
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

    sessionRepo.save({
      id: "sess_acc",
      projectId: "proj_acc",
      name: "Acc Session",
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

    taskRepo.save({
      id: "task_acc_01",
      projectId: "proj_acc",
      sessionId: "sess_acc",
      objective: "End to end distributed acceptance task",
      status: "available",
      priority: "high",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {},
    });

    claimManager = new TaskClaimManager({
      engine,
      taskRepo,
      leaseRepo,
      eventStore,
    });

    nodeRegistry = new NodeRegistry({ nodeRepo, eventStore });
    nodeRegistry.registerNode({
      id: "node_cloud_01",
      nodeVersion: "1.0.0",
      runtimeVersion: "2.0.0",
      endpointUrl: "https://cloud01:9000",
      capabilities: ["cloud_gpu", "python311"],
      projectScope: ["proj_acc"],
    });

    dispatchManager = new RemoteDispatchManager({
      dispatchRepo,
      taskRepo,
      nodeRegistry,
      claimManager,
      eventStore,
    });
  });

  afterEach(() => {
    engine.close();
  });

  it("executes full 14-step distributed lifecycle: Node Register -> Dispatch -> Client Execution -> Heartbeat -> Signed Result -> Acceptance", async () => {
    // 1. Controller dispatches task
    const workRequest = dispatchManager.dispatchTask({
      taskId: "task_acc_01",
      agentId: "agent_cloud_worker",
      projectId: "proj_acc",
      sessionId: "sess_acc",
      requiredCapabilities: ["cloud_gpu"],
    });

    expect(workRequest.nodeId).toBe("node_cloud_01");
    expect(workRequest.generation).toBe(1);

    // 2. Remote Node Client receives work request and executes with heartbeats
    const remoteClient = new RemoteNodeClient({
      nodeId: "node_cloud_01",
      heartbeatSender: async (req) => {
        return dispatchManager.handleRemoteHeartbeat(req);
      },
      heartbeatIntervalMs: 20,
    });

    const remoteResult = await remoteClient.executeTask(workRequest, async (_req, _abortSignal) => {
      // Simulate remote computation
      await new Promise((r) => setTimeout(r, 50));
      return {
        artifacts: ["art_cloud_model_weights_01"],
        data: { accuracy: 0.985 },
        tokensUsed: 500,
        costUsd: 0.005,
      };
    });

    expect(remoteResult.status).toBe("SUCCESS");
    expect(remoteResult.signature).toBeDefined();

    // 3. Controller accepts signed remote result
    const acceptance = dispatchManager.acceptRemoteResult(remoteResult);
    expect(acceptance.success).toBe(true);

    // 4. Verify authoritative task completion and lease release
    const completedTask = taskRepo.findById("task_acc_01");
    expect(completedTask?.status).toBe("completed");

    const releasedLease = leaseRepo.findById(workRequest.leaseId);
    expect(releasedLease?.status).toBe("RELEASED");

    const completedDispatch = dispatchRepo.findDispatchById(workRequest.dispatchId);
    expect(completedDispatch?.status).toBe("COMPLETED");
  });
});
