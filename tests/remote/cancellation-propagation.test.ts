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

describe("P7.4 Remote Nodes — Cancellation Propagation", () => {
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
      id: "proj_canc",
      name: "Cancellation Project",
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
      id: "sess_canc",
      projectId: "proj_canc",
      name: "Canc Session",
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
      id: "task_canc_01",
      projectId: "proj_canc",
      sessionId: "sess_canc",
      objective: "To be cancelled",
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
    nodeRegistry.registerNode({
      id: "node_canc_01",
      nodeVersion: "1.0.0",
      runtimeVersion: "2.0.0",
      endpointUrl: "https://node-canc:9000",
      capabilities: ["worker"],
      projectScope: ["proj_canc"],
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

  it("propagates cancellation, releases lease, and rejects subsequent completion attempts", () => {
    const dispatch = dispatchManager.dispatchTask({
      taskId: "task_canc_01",
      agentId: "agent_canc",
      projectId: "proj_canc",
      sessionId: "sess_canc",
      requiredCapabilities: ["worker"],
    });

    expect(dispatch.status).toBe("DISPATCHED");

    // Cancel dispatch
    dispatchManager.cancelDispatch(dispatch.dispatchId, "User requested cancellation");

    const cancelledDispatch = dispatchRepo.findDispatchById(dispatch.dispatchId);
    expect(cancelledDispatch?.status).toBe("CANCELLED");

    // Lease should be released
    const lease = leaseRepo.findById(dispatch.leaseId);
    expect(lease?.status).toBe("RELEASED");

    // Late completion attempt must be rejected
    const lateRes = dispatchManager.acceptRemoteResult({
      dispatchId: dispatch.dispatchId,
      nodeId: dispatch.nodeId,
      taskId: dispatch.taskId,
      jobId: dispatch.jobId,
      generation: dispatch.generation,
      leaseId: dispatch.leaseId,
      status: "SUCCESS",
      completedAt: new Date().toISOString(),
    });

    expect(lateRes.success).toBe(false);
  });
});
