import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { LeaseRepository } from "../../src/persistence/repositories/lease-repository.js";
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";
import { ToolGateway } from "../../src/tools/tool-gateway.js";
import { ToolRegistry } from "../../src/tools/tool-registry.js";

describe("W-P10.5-01 ToolGateway Side-Effect Lease Fencing", () => {
  let engine: SqliteEngine;
  let claimManager: TaskClaimManager;
  let leaseRepo: LeaseRepository;
  let toolGateway: ToolGateway;
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    new MigrationEngine(engine).migrate();

    const projectRepo = new ProjectRepository(engine);
    const sessionRepo = new SessionRepository(engine);
    const taskRepo = new TaskRepository(engine);
    leaseRepo = new LeaseRepository(engine);

    const now = new Date().toISOString();
    projectRepo.save({
      id: "proj_fencing",
      name: "Fencing Proj",
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
      id: "sess_fencing",
      projectId: "proj_fencing",
      name: "Fencing Session",
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
      id: "task_fencing_01",
      projectId: "proj_fencing",
      sessionId: "sess_fencing",
      objective: "Fencing Task",
      status: "queued",
      priority: "normal",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: now,
      updatedAt: now,
      metadata: {},
    });

    claimManager = new TaskClaimManager({
      engine,
      taskRepo,
      leaseRepo,
    });

    toolRegistry = new ToolRegistry();
    toolRegistry.register({
      definition: {
        name: "write_file",
        parametersSchema: {
          type: "object",
          properties: {
            path: { type: "string" },
            content: { type: "string" },
          },
          required: ["path", "content"],
        },
      },
      handler: async () => {
        return { written: true };
      },
    });

    toolGateway = new ToolGateway({
      registry: toolRegistry,
      claimManager,
    });
  });

  afterEach(() => {
    engine.close();
  });

  it("blocks side effect execution if task lease has been revoked or expired", async () => {
    const claim = claimManager.claimTask({
      taskId: "task_fencing_01",
      agentId: "agent_A",
      instanceId: "inst_A",
      projectId: "proj_fencing",
      sessionId: "sess_fencing",
      ttlMs: 5000,
    });
    expect(claim.success).toBe(true);
    const lease = claim.lease!;

    // Worker executes tool with active lease -> SUCCESS
    const obs1 = await toolGateway.invoke({
      callId: "call_01",
      toolName: "write_file",
      arguments: { path: "test.txt", content: "data" },
      actor: { id: "agent_A", type: "agent" },
      project: { id: "proj_fencing" },
      session: { id: "sess_fencing" },
      task: { id: "task_fencing_01", leaseId: lease.id, generation: lease.generation },
    });
    expect(obs1.status).toBe("success");

    // Simulate lease revocation / expiration
    leaseRepo.updateStatus(lease.id, "REVOKED");

    // Stale worker attempts another tool execution -> DENIED before handler executes
    const obs2 = await toolGateway.invoke({
      callId: "call_02",
      toolName: "write_file",
      arguments: { path: "test.txt", content: "malicious_overwrite" },
      actor: { id: "agent_A", type: "agent" },
      project: { id: "proj_fencing" },
      session: { id: "sess_fencing" },
      task: { id: "task_fencing_01", leaseId: lease.id, generation: lease.generation },
    });
    expect(obs2.status).toBe("denied");
    expect(obs2.error?.code).toBe("LEASE_FENCING_ERROR");
  });
});
