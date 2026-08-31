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

describe("P7.4 Remote Nodes — Project Tenant Isolation", () => {
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

    // Project Alpha
    projectRepo.save({
      id: "proj_alpha",
      name: "Alpha Project",
      rootPath: "/alpha",
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
      id: "sess_alpha",
      projectId: "proj_alpha",
      name: "Alpha Session",
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
      id: "task_alpha_01",
      projectId: "proj_alpha",
      sessionId: "sess_alpha",
      objective: "Alpha confidential task",
      status: "available",
      priority: "high",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {},
    });

    // Project Beta
    projectRepo.save({
      id: "proj_beta",
      name: "Beta Project",
      rootPath: "/beta",
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
      id: "sess_beta",
      projectId: "proj_beta",
      name: "Beta Session",
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

    claimManager = new TaskClaimManager({
      engine,
      taskRepo,
      leaseRepo,
      eventStore,
    });

    nodeRegistry = new NodeRegistry({ nodeRepo, eventStore });

    // Node strictly scoped to Project Beta
    nodeRegistry.registerNode({
      id: "node_beta_isolated",
      nodeVersion: "1.0.0",
      runtimeVersion: "2.0.0",
      endpointUrl: "https://beta-node:9000",
      capabilities: ["worker"],
      projectScope: ["proj_beta"], // Only Beta!
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

  it("fails dispatch when no node is scoped for Project Alpha", () => {
    expect(() => {
      dispatchManager.dispatchTask({
        taskId: "task_alpha_01",
        agentId: "agent_alpha",
        projectId: "proj_alpha",
        sessionId: "sess_alpha",
        requiredCapabilities: ["worker"],
      });
    }).toThrow("No eligible remote node available");
  });
});
