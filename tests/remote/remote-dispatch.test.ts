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

describe("P7.4 Remote Nodes — Remote Task Dispatch Lifecycle", () => {
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
      id: "proj_remote",
      name: "Remote Project",
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
      id: "sess_remote",
      projectId: "proj_remote",
      name: "Remote Session",
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
      id: "task_remote_01",
      projectId: "proj_remote",
      sessionId: "sess_remote",
      objective: "Remote computation task",
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
      id: "node_worker_01",
      nodeVersion: "1.0.0",
      runtimeVersion: "2.0.0",
      endpointUrl: "https://worker1:9000",
      capabilities: ["compute", "python"],
      projectScope: ["proj_remote"],
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

  it("dispatches task to registered remote node, acquiring lease with generation token", () => {
    const dispatch = dispatchManager.dispatchTask({
      taskId: "task_remote_01",
      agentId: "agent_compute",
      projectId: "proj_remote",
      sessionId: "sess_remote",
      requiredCapabilities: ["compute"],
    });

    expect(dispatch.status).toBe("DISPATCHED");
    expect(dispatch.nodeId).toBe("node_worker_01");
    expect(dispatch.generation).toBe(1);
    expect(dispatch.leaseId).toBeDefined();

    // Verify lease is active in LeaseRepository
    const lease = leaseRepo.findById(dispatch.leaseId);
    expect(lease?.status).toBe("ACTIVE");
    expect(lease?.generation).toBe(1);

    // Verify task is claimed in TaskRepository
    const task = taskRepo.findById("task_remote_01");
    expect(task?.status).toBe("claimed");
  });

  it("accepts valid result and marks dispatch and task COMPLETED", () => {
    const dispatch = dispatchManager.dispatchTask({
      taskId: "task_remote_01",
      agentId: "agent_compute",
      projectId: "proj_remote",
      sessionId: "sess_remote",
      requiredCapabilities: ["compute"],
    });

    const res = dispatchManager.acceptRemoteResult({
      dispatchId: dispatch.dispatchId,
      nodeId: dispatch.nodeId,
      taskId: dispatch.taskId,
      jobId: dispatch.jobId,
      generation: dispatch.generation,
      leaseId: dispatch.leaseId,
      status: "SUCCESS",
      artifacts: ["art_remote_out_01"],
      data: { score: 99 },
      completedAt: new Date().toISOString(),
      consumption: { tokens: 50, costUsd: 0.0005, durationMs: 120, toolCalls: 2 },
    });

    expect(res.success).toBe(true);

    const updatedDispatch = dispatchRepo.findDispatchById(dispatch.dispatchId);
    expect(updatedDispatch?.status).toBe("COMPLETED");

    const updatedTask = taskRepo.findById("task_remote_01");
    expect(updatedTask?.status).toBe("completed");

    const updatedLease = leaseRepo.findById(dispatch.leaseId);
    expect(updatedLease?.status).toBe("RELEASED");
  });
});
