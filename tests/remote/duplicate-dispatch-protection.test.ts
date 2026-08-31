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

describe("P7.4 Remote Nodes — Duplicate Dispatch & Idempotency", () => {
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
      id: "proj_idem",
      name: "Idempotency Project",
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
      id: "sess_idem",
      projectId: "proj_idem",
      name: "Idem Session",
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
      id: "task_idem_01",
      projectId: "proj_idem",
      sessionId: "sess_idem",
      objective: "Idempotent task",
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
      endpointUrl: "https://worker:9000",
      capabilities: ["compute"],
      projectScope: ["proj_idem"],
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

  it("submitting the same dispatch with identical idempotencyKey returns existing record without duplicate lease", () => {
    const disp1 = dispatchManager.dispatchTask({
      taskId: "task_idem_01",
      agentId: "agent_idem",
      projectId: "proj_idem",
      sessionId: "sess_idem",
      idempotencyKey: "idem_key_abc_123",
    });

    const disp2 = dispatchManager.dispatchTask({
      taskId: "task_idem_01",
      agentId: "agent_idem",
      projectId: "proj_idem",
      sessionId: "sess_idem",
      idempotencyKey: "idem_key_abc_123",
    });

    expect(disp1.dispatchId).toBe(disp2.dispatchId);
    expect(disp1.leaseId).toBe(disp2.leaseId);
    expect(disp1.generation).toBe(disp2.generation);
  });
});
