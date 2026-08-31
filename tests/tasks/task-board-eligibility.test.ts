import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository, SessionRepository, TaskRepository } from "../../src/persistence/index.js";
import { TaskBoard } from "../../src/tasks/task-board.js";
import { AgentStartupPlan } from "../../src/domain/agent.js";
import { Task } from "../../src/domain/task.js";

describe("P6.2 Tasks — Task Board & Eligibility", () => {
  let db: SqliteEngine;
  let taskRepo: TaskRepository;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let board: TaskBoard;

  beforeEach(() => {
    db = new SqliteEngine({ path: ":memory:" });
    db.open();
    const migrator = new MigrationEngine(db);
    migrator.migrate();

    projectRepo = new ProjectRepository(db);
    sessionRepo = new SessionRepository(db);
    taskRepo = new TaskRepository(db);
    board = new TaskBoard({ taskRepo });

    projectRepo.save({
      id: "proj_01",
      name: "Board Project",
      rootPath: "C:/board_proj",
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
      id: "sess_01",
      projectId: "proj_01",
      name: "Board Session",
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

  it("filters and lists tasks matching dependency, role, and budget criteria", () => {
    const parentTask: Task = {
      id: "task_parent",
      projectId: "proj_01",
      sessionId: "sess_01",
      objective: "Parent task",
      status: "completed",
      priority: "normal",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: "2026-08-31T00:01:00.000Z",
      updatedAt: "2026-08-31T00:01:00.000Z",
    };

    const dependentTask: Task = {
      id: "task_child",
      projectId: "proj_01",
      sessionId: "sess_01",
      objective: "Child task",
      status: "queued",
      priority: "high",
      dependencies: ["task_parent"],
      inputArtifacts: [],
      outputArtifacts: [],
      agentRole: "Specialist",
      createdAt: "2026-08-31T00:02:00.000Z",
      updatedAt: "2026-08-31T00:02:00.000Z",
    };

    const uncompletedDepTask: Task = {
      id: "task_blocked_child",
      projectId: "proj_01",
      sessionId: "sess_01",
      objective: "Blocked child task",
      status: "queued",
      priority: "critical",
      dependencies: ["non_existent_dep"],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: "2026-08-31T00:03:00.000Z",
      updatedAt: "2026-08-31T00:03:00.000Z",
    };

    taskRepo.save(parentTask);
    taskRepo.save(dependentTask);
    taskRepo.save(uncompletedDepTask);

    const startupPlan: AgentStartupPlan = {
      planId: "plan_spec_01",
      agentId: "agent_spec",
      version: "1.0.0",
      role: "Specialist",
      objective: "Execute tasks",
      resolvedModel: { modelId: "m1", provider: "p1", contextLimit: 128000 },
      resolvedCapabilities: [],
      resolvedTools: [],
      resolvedSkills: [],
      grantedPermissions: ["filesystem.read"],
      executor: { type: "local", isSandboxed: false },
      contextScope: { maxTokens: 64000, allowedPaths: ["**/*"], includeMemory: true, allowedRepresentations: ["text"] },
      memoryScope: { namespace: "agent:agent_spec", readonly: false, crossProjectAccess: false },
      budget: { maxTokens: 50000, maxCostUsd: 2.0, maxToolCalls: 50, maxDurationSeconds: 1800 },
      projectId: "proj_01",
      sessionId: "sess_01",
      resolvedAt: "2026-08-31T00:00:00.000Z",
    };

    const eligible = board.listEligibleTasks(startupPlan);
    expect(eligible).toHaveLength(1);
    expect(eligible[0]?.id).toBe("task_child");
  });

  it("sorts eligible tasks deterministically by priority DESC then createdAt ASC", () => {
    const taskLow: Task = {
      id: "task_low",
      projectId: "proj_01",
      sessionId: "sess_01",
      objective: "Low priority",
      status: "queued",
      priority: "low",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: "2026-08-31T00:01:00.000Z",
      updatedAt: "2026-08-31T00:01:00.000Z",
    };

    const taskCritical: Task = {
      id: "task_critical",
      projectId: "proj_01",
      sessionId: "sess_01",
      objective: "Critical priority",
      status: "queued",
      priority: "critical",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: "2026-08-31T00:05:00.000Z",
      updatedAt: "2026-08-31T00:05:00.000Z",
    };

    const taskHigh1: Task = {
      id: "task_high_1",
      projectId: "proj_01",
      sessionId: "sess_01",
      objective: "High priority earlier",
      status: "queued",
      priority: "high",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: "2026-08-31T00:02:00.000Z",
      updatedAt: "2026-08-31T00:02:00.000Z",
    };

    const taskHigh2: Task = {
      id: "task_high_2",
      projectId: "proj_01",
      sessionId: "sess_01",
      objective: "High priority later",
      status: "queued",
      priority: "high",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: "2026-08-31T00:03:00.000Z",
      updatedAt: "2026-08-31T00:03:00.000Z",
    };

    taskRepo.save(taskLow);
    taskRepo.save(taskCritical);
    taskRepo.save(taskHigh1);
    taskRepo.save(taskHigh2);

    const startupPlan: AgentStartupPlan = {
      planId: "plan_sort_01",
      agentId: "agent_sort",
      version: "1.0.0",
      role: "Generalist",
      objective: "Sort test",
      resolvedModel: { modelId: "m1", provider: "p1", contextLimit: 128000 },
      resolvedCapabilities: [],
      resolvedTools: [],
      resolvedSkills: [],
      grantedPermissions: ["filesystem.read"],
      executor: { type: "local", isSandboxed: false },
      contextScope: { maxTokens: 64000, allowedPaths: ["**/*"], includeMemory: true, allowedRepresentations: ["text"] },
      memoryScope: { namespace: "agent:agent_sort", readonly: false, crossProjectAccess: false },
      budget: { maxTokens: 50000, maxCostUsd: 2.0, maxToolCalls: 50, maxDurationSeconds: 1800 },
      projectId: "proj_01",
      sessionId: "sess_01",
      resolvedAt: "2026-08-31T00:00:00.000Z",
    };

    const eligible = board.listEligibleTasks(startupPlan);
    expect(eligible).toHaveLength(4);
    expect(eligible[0]?.id).toBe("task_critical");
    expect(eligible[1]?.id).toBe("task_high_1");
    expect(eligible[2]?.id).toBe("task_high_2");
    expect(eligible[3]?.id).toBe("task_low");
  });
});
