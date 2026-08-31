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

describe("P7.4 Remote Nodes — Network Partition & Split-Brain Prevention", () => {
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
      id: "proj_split",
      name: "Split Brain Test Project",
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

    sessionRepo.save({
      id: "sess_split",
      projectId: "proj_split",
      name: "Split Session",
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
      id: "task_split_01",
      projectId: "proj_split",
      sessionId: "sess_split",
      objective: "Critical shared data mutation",
      status: "available",
      priority: "normal",
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

    // Node A
    nodeRegistry.registerNode({
      id: "node_A",
      nodeVersion: "1.0.0",
      runtimeVersion: "2.0.0",
      endpointUrl: "https://nodeA:9000",
      capabilities: ["worker"],
      projectScope: ["proj_split"],
    });

    // Node B
    nodeRegistry.registerNode({
      id: "node_B",
      nodeVersion: "1.0.0",
      runtimeVersion: "2.0.0",
      endpointUrl: "https://nodeB:9000",
      capabilities: ["worker"],
      projectScope: ["proj_split"],
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

  it("MANDATORY SPLIT-BRAIN SCENARIO: Node A partition -> Controller reclaim -> Node B gen N+1 -> Node A reconnect rejection", () => {
    // 1. Controller dispatches task to Node A -> gets generation 1
    const dispatchA = dispatchManager.dispatchTask({
      taskId: "task_split_01",
      agentId: "agent_A",
      projectId: "proj_split",
      sessionId: "sess_split",
      requiredCapabilities: ["worker"],
      targetNodeId: "node_A",
    });

    expect(dispatchA.nodeId).toBe("node_A");
    expect(dispatchA.generation).toBe(1);

    // 2. Network partition: Node A becomes unreachable.
    // Controller reclaims task and resets to available
    claimManager.releaseTask(dispatchA.taskId, dispatchA.leaseId, dispatchA.generation, "PARTITION_TIMEOUT");
    taskRepo.updateStatus(dispatchA.taskId, "available");

    // 3. Controller dispatches task to Node B -> gets generation 2
    const dispatchB = dispatchManager.dispatchTask({
      taskId: "task_split_01",
      agentId: "agent_B",
      projectId: "proj_split",
      sessionId: "sess_split",
      requiredCapabilities: ["worker"],
      targetNodeId: "node_B",
      idempotencyKey: "idem_dispatch_B",
    });

    expect(dispatchB.nodeId).toBe("node_B");
    expect(dispatchB.generation).toBe(2);

    // 4. Node A reconnects and attempts heartbeat with stale gen 1 -> MUST BE REJECTED
    const staleHeartbeat = dispatchManager.handleRemoteHeartbeat({
      dispatchId: dispatchA.dispatchId,
      nodeId: "node_A",
      leaseId: dispatchA.leaseId,
      generation: 1,
      agentId: "agent_A",
      instanceId: dispatchA.instanceId,
    });

    expect(staleHeartbeat.success).toBe(false);
    expect(staleHeartbeat.reason).toBeDefined();

    // 5. Node A attempts to submit result with stale gen 1 -> MUST BE REJECTED
    const staleResult = dispatchManager.acceptRemoteResult({
      dispatchId: dispatchA.dispatchId,
      nodeId: "node_A",
      taskId: "task_split_01",
      jobId: dispatchA.jobId,
      generation: 1,
      leaseId: dispatchA.leaseId,
      status: "SUCCESS",
      artifacts: ["art_nodeA_stale"],
      data: { corrupted: true },
      completedAt: new Date().toISOString(),
    });

    expect(staleResult.success).toBe(false);
    expect(staleResult.reason).toBeDefined();

    // 6. Node B submits legitimate result with generation 2 -> SUCCEEDS
    const validResult = dispatchManager.acceptRemoteResult({
      dispatchId: dispatchB.dispatchId,
      nodeId: "node_B",
      taskId: "task_split_01",
      jobId: dispatchB.jobId,
      generation: 2,
      leaseId: dispatchB.leaseId,
      status: "SUCCESS",
      artifacts: ["art_nodeB_legitimate"],
      data: { legitimate: true },
      completedAt: new Date().toISOString(),
    });

    expect(validResult.success).toBe(true);

    const task = taskRepo.findById("task_split_01");
    expect(task?.status).toBe("completed");
  });
});
