import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository, SessionRepository, TaskRepository, LeaseRepository } from "../../src/persistence/index.js";
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";
import { StalledAgentRecoveryEngine } from "../../src/tasks/stalled-agent-recovery.js";
import { AgentManager } from "../../src/agents/agent-manager.js";
import { Task } from "../../src/domain/task.js";
import { AgentManifest } from "../../src/domain/agent.js";

describe("P6.2 Tasks — Stalled Agent Detection & Classification", () => {
  let db: SqliteEngine;
  let taskRepo: TaskRepository;
  let leaseRepo: LeaseRepository;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let claimManager: TaskClaimManager;
  let agentManager: AgentManager;
  let recoveryEngine: StalledAgentRecoveryEngine;

  beforeEach(() => {
    db = new SqliteEngine({ path: ":memory:" });
    db.open();
    const migrator = new MigrationEngine(db);
    migrator.migrate();

    projectRepo = new ProjectRepository(db);
    sessionRepo = new SessionRepository(db);
    taskRepo = new TaskRepository(db);
    leaseRepo = new LeaseRepository(db);
    agentManager = new AgentManager();

    claimManager = new TaskClaimManager({
      engine: db,
      taskRepo,
      leaseRepo,
    });

    recoveryEngine = new StalledAgentRecoveryEngine({
      engine: db,
      taskRepo,
      leaseRepo,
      agentManager,
    });

    projectRepo.save({
      id: "proj_detect",
      name: "Detection Project",
      rootPath: "C:/detect_proj",
      status: "active",
      tags: [],
      modelProfile: "m",
      memoryNamespace: "mem",
      orchestrationProfile: "o",
      trustProfile: "developer",
      createdAt: "2026-08-31T00:00:00.000Z",
      lastOpenedAt: "2026-08-31T00:00:00.000Z",
      lastActivityAt: "2026-08-31T00:00:00.000Z",
    });

    sessionRepo.save({
      id: "sess_detect",
      projectId: "proj_detect",
      name: "Detection Session",
      branch: "main",
      status: "active",
      modelProfile: "m",
      keyPoolProfile: "k",
      mode: "interactive",
      permissions: {},
      createdAt: "2026-08-31T00:00:00.000Z",
      updatedAt: "2026-08-31T00:00:00.000Z",
    });
  });

  afterEach(() => {
    db.close();
  });

  it("detects expired leases and classifies stall as AGENT_CRASHED when agent instance stopped", () => {
    const manifest: AgentManifest = {
      id: "agent_worker",
      name: "Worker",
      version: "1.0.0",
      role: "Worker",
      objective: "Do work",
      modelProfile: "fast",
      requiredCapabilities: [],
      tools: [],
      skills: [],
      permissionProfile: "developer",
      executorProfile: "local",
      budget: {},
      contextScope: {},
      scope: "project",
      projectId: "proj_detect",
    };
    agentManager.register(manifest);

    const resolveRes = agentManager.resolveStartup("agent_worker", {
      projectId: "proj_detect",
      sessionId: "sess_detect",
    });
    const instance = agentManager.createInstance(resolveRes.startupPlan!);

    const task: Task = {
      id: "task_crash_01",
      projectId: "proj_detect",
      sessionId: "sess_detect",
      objective: "Crash test task",
      status: "queued",
      priority: "high",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: "2026-08-31T00:01:00.000Z",
      updatedAt: "2026-08-31T00:01:00.000Z",
    };
    taskRepo.save(task);

    const claimRes = claimManager.claimTask({
      taskId: "task_crash_01",
      agentId: "agent_worker",
      instanceId: instance.instanceId,
      projectId: "proj_detect",
      sessionId: "sess_detect",
      ttlMs: 5000,
    });
    expect(claimRes.success).toBe(true);

    // Agent crashes / stops
    agentManager.stopInstance(instance.instanceId);

    // Check stalled leases at t + 10s
    const futureTime = new Date(Date.now() + 10000).toISOString();
    const stalled = recoveryEngine.detectStalledLeases(futureTime);
    expect(stalled).toHaveLength(1);

    const classification = recoveryEngine.classifyStall(stalled[0]!);
    expect(classification).toBe("AGENT_CRASHED");
  });
});
