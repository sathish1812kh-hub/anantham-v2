import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository, SessionRepository, TaskRepository, LeaseRepository } from "../../src/persistence/index.js";
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";
import { TaskBoard } from "../../src/tasks/task-board.js";
import { Task } from "../../src/domain/task.js";
import { AgentStartupPlan } from "../../src/domain/agent.js";

describe("P6.2 Tasks — Project Isolation", () => {
  let db: SqliteEngine;
  let taskRepo: TaskRepository;
  let leaseRepo: LeaseRepository;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let claimManager: TaskClaimManager;
  let taskBoard: TaskBoard;

  beforeEach(() => {
    db = new SqliteEngine({ path: ":memory:" });
    db.open();
    const migrator = new MigrationEngine(db);
    migrator.migrate();

    projectRepo = new ProjectRepository(db);
    sessionRepo = new SessionRepository(db);
    taskRepo = new TaskRepository(db);
    leaseRepo = new LeaseRepository(db);

    claimManager = new TaskClaimManager({
      engine: db,
      taskRepo,
      leaseRepo,
    });
    taskBoard = new TaskBoard({ taskRepo, leaseRepo });

    // Project Alpha
    projectRepo.save({
      id: "proj_alpha",
      name: "Project Alpha",
      rootPath: "C:/alpha",
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
      id: "sess_alpha",
      projectId: "proj_alpha",
      name: "Session Alpha",
      branch: "main",
      status: "active",
      modelProfile: "m",
      keyPoolProfile: "k",
      mode: "interactive",
      permissions: {},
      createdAt: "2026-08-31T00:00:00.000Z",
      updatedAt: "2026-08-31T00:00:00.000Z",
    });

    // Project Beta
    projectRepo.save({
      id: "proj_beta",
      name: "Project Beta",
      rootPath: "C:/beta",
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
      id: "sess_beta",
      projectId: "proj_beta",
      name: "Session Beta",
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

  it("strictly prevents cross-project task claims and queries", () => {
    const taskAlpha: Task = {
      id: "task_alpha_secret",
      projectId: "proj_alpha",
      sessionId: "sess_alpha",
      objective: "Confidential Alpha Work",
      status: "queued",
      priority: "high",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: "2026-08-31T00:01:00.000Z",
      updatedAt: "2026-08-31T00:01:00.000Z",
    };
    taskRepo.save(taskAlpha);

    // Agent in Project Beta attempts to claim Project Alpha's task
    const crossClaim = claimManager.claimTask({
      taskId: "task_alpha_secret",
      agentId: "agent_beta_worker",
      instanceId: "inst_beta_01",
      projectId: "proj_beta",
      sessionId: "sess_beta",
    });

    expect(crossClaim.success).toBe(false);
    expect(crossClaim.errorCode).toBe("PROJECT_ISOLATION_VIOLATION");

    // Agent in Project Beta lists eligible tasks -> Project Alpha task is excluded
    const betaStartupPlan: AgentStartupPlan = {
      planId: "plan_beta_01",
      agentId: "agent_beta",
      version: "1.0.0",
      role: "Worker",
      objective: "Beta Work",
      resolvedModel: { modelId: "m1", provider: "p1", contextLimit: 128000 },
      resolvedCapabilities: [],
      resolvedTools: [],
      resolvedSkills: [],
      grantedPermissions: [],
      executor: { type: "local", isSandboxed: false },
      contextScope: {},
      memoryScope: { namespace: "agent:agent_beta", readonly: false, crossProjectAccess: false },
      budget: { maxTokens: 10000, maxCostUsd: 1.0, maxToolCalls: 10, maxDurationSeconds: 600 },
      projectId: "proj_beta",
      sessionId: "sess_beta",
      resolvedAt: "2026-08-31T00:00:00.000Z",
    };

    const eligible = taskBoard.listEligibleTasks(betaStartupPlan);
    expect(eligible).toHaveLength(0);
  });
});
