import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../../src/persistence/migration-engine.js";
import { WorkflowRepository } from "../../../src/persistence/repositories/workflow-repository.js";
import { ProjectRepository } from "../../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../../src/persistence/repositories/session-repository.js";
import { EventStore } from "../../../src/event-state/event-store.js";
import { WorkflowRegistry } from "../../../src/workflow/workflow-registry.js";
import { WorkflowEngine } from "../../../src/workflow/workflow-engine.js";
import { defineWorkflow, task, parallel } from "../../../src/workflow/workflow-dsl.js";

describe("P7.2 Workflow Engine — Parallel Branching & Concurrency Pooling", () => {
  let engine: SqliteEngine;
  let workflowRepo: WorkflowRepository;
  let registry: WorkflowRegistry;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    const projectRepo = new ProjectRepository(engine);
    const sessionRepo = new SessionRepository(engine);

    projectRepo.save({
      id: "proj_01",
      name: "Test Project",
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
      id: "sess_01",
      projectId: "proj_01",
      name: "Session",
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

    const eventStore = new EventStore(engine);
    workflowRepo = new WorkflowRepository(engine);
    registry = new WorkflowRegistry({ workflowRepo, eventStore });
  });

  afterEach(() => {
    engine.close();
  });

  it("executes parallel node sub-tasks concurrently and aggregates results", async () => {
    let maxSimultaneous = 0;
    let currentActive = 0;

    const parallelDispatcher = async (node: any) => {
      currentActive++;
      if (currentActive > maxSimultaneous) maxSimultaneous = currentActive;
      await new Promise((r) => setTimeout(r, 50));
      currentActive--;
      return { status: "completed" as const, result: { done: true, subTaskId: node.id }, tokensUsed: 100 };
    };

    const wf = defineWorkflow({
      id: "wf_parallel_01",
      projectId: "proj_01",
      name: "parallel-workflow",
      version: "1.0.0",
      tasks: [
        task("init", { agentId: "agent_init" }),
        parallel(
          "par_group",
          [
            task("p1", { agentId: "agent_p1" }),
            task("p2", { agentId: "agent_p2" }),
            task("p3", { agentId: "agent_p3" }),
            task("p4", { agentId: "agent_p4" }),
          ],
          { maxConcurrency: 4, dependsOn: ["init"] }
        ),
      ],
    });

    const workflowEngine = new WorkflowEngine({
      workflowRepo,
      registry,
      taskDispatcher: parallelDispatcher,
    });

    const run = await workflowEngine.startWorkflow(wf, "sess_01");
    expect(run.status).toBe("COMPLETED");
    expect(run.completedTasks).toContain("par_group");
    expect(maxSimultaneous).toBeGreaterThan(1);

    const groupResult = run.taskResults["par_group"] as Record<string, any>;
    expect(groupResult).toBeDefined();
    expect(groupResult["p1"]?.done).toBe(true);
    expect(groupResult["p4"]?.done).toBe(true);
  });
});
