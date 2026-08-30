import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskDagRestorer } from "../../src/resume/task-dag-restorer.js";
import type { Task } from "../../src/domain/task.js";

describe("P1.5 Resume Subsystem — Task DAG Restorer", () => {
  let engine: SqliteEngine;
  let taskRepo: TaskRepository;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    taskRepo = new TaskRepository(engine);
    projectRepo = new ProjectRepository(engine);
    sessionRepo = new SessionRepository(engine);

    projectRepo.save({
      id: "proj_dag_01",
      name: "DAG Project",
      rootPath: "/tmp/dag",
      status: "active",
      tags: [],
      modelProfile: "claude-3-5-sonnet",
      memoryNamespace: "m",
      orchestrationProfile: "o",
      trustProfile: "developer",
      createdAt: "2026-08-30T21:00:00.000Z",
      lastOpenedAt: "2026-08-30T21:00:00.000Z",
      lastActivityAt: "2026-08-30T21:00:00.000Z",
    });

    sessionRepo.save({
      id: "sess_dag_01",
      projectId: "proj_dag_01",
      name: "DAG Session",
      branch: "main",
      status: "active",
      modelProfile: "claude-3-5-sonnet",
      keyPoolProfile: "k",
      mode: "interactive",
      permissions: {},
      createdAt: "2026-08-30T21:00:00.000Z",
      updatedAt: "2026-08-30T21:00:00.000Z",
    });
  });

  afterEach(() => {
    engine.close();
  });

  it("reconstructs task execution topology and topological sort", () => {
    const t1: Task = {
      id: "task_01",
      projectId: "proj_dag_01",
      sessionId: "sess_dag_01",
      objective: "Root task",
      status: "completed",
      priority: "high",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: "2026-08-30T21:00:00.000Z",
      updatedAt: "2026-08-30T21:00:00.000Z",
    };

    const t2: Task = {
      id: "task_02",
      projectId: "proj_dag_01",
      sessionId: "sess_dag_01",
      objective: "Dependent child task",
      status: "queued",
      priority: "normal",
      dependencies: ["task_01"],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: "2026-08-30T21:00:01.000Z",
      updatedAt: "2026-08-30T21:00:01.000Z",
    };

    const t3: Task = {
      id: "task_03",
      projectId: "proj_dag_01",
      sessionId: "sess_dag_01",
      objective: "Grandchild task",
      status: "blocked",
      priority: "low",
      dependencies: ["task_02"],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: "2026-08-30T21:00:02.000Z",
      updatedAt: "2026-08-30T21:00:02.000Z",
    };

    taskRepo.save(t1);
    taskRepo.save(t2);
    taskRepo.save(t3);

    const dag = TaskDagRestorer.restoreDAG([t1, t2, t3]);

    expect(dag.totalTasksCount).toBe(3);
    expect(dag.completedTasks).toHaveLength(1);
    expect(dag.queuedTasks).toHaveLength(1);
    expect(dag.blockedTasks).toHaveLength(1);
    expect(dag.executionOrder).toEqual(["task_01", "task_02", "task_03"]);
    expect(dag.unresolvedDependencies["task_03"]).toContain("task_02");
  });

  it("reconciles crash-interrupted running/claimed tasks back to queued", () => {
    const tRunning: Task = {
      id: "task_interrupted",
      projectId: "proj_dag_01",
      sessionId: "sess_dag_01",
      objective: "Interrupted running work",
      status: "running",
      priority: "critical",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: "2026-08-30T21:00:00.000Z",
      updatedAt: "2026-08-30T21:00:00.000Z",
    };

    taskRepo.save(tRunning);

    const dag = TaskDagRestorer.restoreDAG([tRunning], { taskRepo, reconcileInterruptedTasks: true });

    expect(dag.runningTasks).toHaveLength(0);
    expect(dag.queuedTasks).toHaveLength(1);
    expect(dag.queuedTasks[0].id).toBe("task_interrupted");
    expect(dag.queuedTasks[0].status).toBe("queued");
  });
});
