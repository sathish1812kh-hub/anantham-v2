import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { LeaseRepository } from "../../src/persistence/repositories/lease-repository.js";
import { RemoteDispatchRepository } from "../../src/persistence/repositories/remote-dispatch-repository.js";
import { NodeRepository } from "../../src/persistence/repositories/node-repository.js";
import { NodeRegistry } from "../../src/remote/node-registry.js";
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";
import { RemoteDispatchManager } from "../../src/remote/remote-dispatch-manager.js";

describe("W-P10.5-03 RemoteDispatchManager Atomic State Commitment", () => {
  let engine: SqliteEngine;
  let taskRepo: TaskRepository;
  let dispatchRepo: RemoteDispatchRepository;
  let dispatchManager: RemoteDispatchManager;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    new MigrationEngine(engine).migrate();

    const projectRepo = new ProjectRepository(engine);
    const sessionRepo = new SessionRepository(engine);
    taskRepo = new TaskRepository(engine);
    const leaseRepo = new LeaseRepository(engine);
    const nodeRepo = new NodeRepository(engine);
    dispatchRepo = new RemoteDispatchRepository(engine);

    const now = new Date().toISOString();
    projectRepo.save({
      id: "proj_rem",
      name: "Remote Proj",
      rootPath: process.cwd(),
      status: "active",
      tags: [],
      modelProfile: "default",
      memoryNamespace: "default",
      orchestrationProfile: "default",
      trustProfile: "safe",
      createdAt: now,
      lastOpenedAt: now,
      lastActivityAt: now,
      metadata: {},
    });

    sessionRepo.save({
      id: "sess_rem",
      projectId: "proj_rem",
      name: "Remote Session",
      branch: "main",
      status: "active",
      modelProfile: "default",
      keyPoolProfile: "default",
      mode: "interactive",
      permissions: {},
      createdAt: now,
      updatedAt: now,
      metadata: {},
    });

    taskRepo.save({
      id: "task_rem_01",
      projectId: "proj_rem",
      sessionId: "sess_rem",
      objective: "Remote Task",
      status: "queued",
      priority: "normal",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: now,
      updatedAt: now,
      metadata: {},
    });

    const nodeRegistry = new NodeRegistry({ nodeRepo });
    nodeRegistry.registerNode({
      id: "node_rem_01",
      hostname: "node-1.local",
      ipAddress: "127.0.0.1",
      endpointUrl: "http://127.0.0.1:8080",
      nodeVersion: "2.0.0",
      runtimeVersion: "2.0.0",
      capabilities: ["*"],
      maxConcurrency: 4,
      allowedProjects: ["*"],
    });

    const claimManager = new TaskClaimManager({
      engine,
      taskRepo,
      leaseRepo,
    });

    dispatchManager = new RemoteDispatchManager({
      dispatchRepo,
      taskRepo,
      nodeRegistry,
      claimManager,
    });
  });

  afterEach(() => {
    engine.close();
  });

  it("atomically commits both underlying task status and dispatch status on remote completion", () => {
    const dispatch = dispatchManager.dispatchTask({
      taskId: "task_rem_01",
      agentId: "agent_remote",
      projectId: "proj_rem",
      sessionId: "sess_rem",
      targetNodeId: "node_rem_01",
    });

    expect(dispatch.status).toBe("DISPATCHED");

    const acceptRes = dispatchManager.acceptRemoteResult({
      dispatchId: dispatch.dispatchId,
      nodeId: "node_rem_01",
      taskId: "task_rem_01",
      jobId: dispatch.jobId,
      generation: dispatch.generation,
      leaseId: dispatch.leaseId,
      status: "SUCCESS",
      artifacts: ["art_res_01"],
      completedAt: new Date().toISOString(),
    });

    expect(acceptRes.success).toBe(true);

    const savedDispatch = dispatchRepo.findDispatchById(dispatch.dispatchId);
    expect(savedDispatch?.status).toBe("COMPLETED");

    const savedTask = taskRepo.findById("task_rem_01");
    expect(savedTask?.status).toBe("completed");
  });
});
