import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../../src/persistence/migration-engine.js";
import { WorkflowRepository } from "../../../src/persistence/repositories/workflow-repository.js";
import { ProjectRepository } from "../../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../../src/persistence/repositories/session-repository.js";
import { EventStore } from "../../../src/event-state/event-store.js";
import { WorkflowRegistry } from "../../../src/workflow/workflow-registry.js";
import { WorkflowEngine } from "../../../src/workflow/workflow-engine.js";
import { defineWorkflow, task } from "../../../src/workflow/workflow-dsl.js";

describe("P7.2 Workflow Engine — DAG Wave Execution & Dependency Ordering", () => {
  let engine: SqliteEngine;
  let workflowRepo: WorkflowRepository;
  let registry: WorkflowRegistry;
  let workflowEngine: WorkflowEngine;

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
    workflowEngine = new WorkflowEngine({ workflowRepo, registry, eventStore });
  });

  afterEach(() => {
    engine.close();
  });

  it("executes a diamond DAG ensuring join node waits for both branches", async () => {
    const executionOrder: string[] = [];

    const customDispatcher = async (node: any) => {
      executionOrder.push(node.id);
      return { status: "completed" as const, result: { done: true }, tokensUsed: 50 };
    };

    const wf = defineWorkflow({
      id: "wf_diamond_01",
      projectId: "proj_01",
      name: "diamond-pipeline",
      version: "1.0.0",
      tasks: [
        task("start", { agentId: "agent_root" }),
        task("branch_left", { agentId: "agent_left", dependsOn: ["start"] }),
        task("branch_right", { agentId: "agent_right", dependsOn: ["start"] }),
        task("join", { agentId: "agent_join", dependsOn: ["branch_left", "branch_right"] }),
      ],
    });

    const engineWithCustomDispatcher = new WorkflowEngine({
      workflowRepo,
      registry,
      taskDispatcher: customDispatcher,
    });

    const run = await engineWithCustomDispatcher.startWorkflow(wf, "sess_01");
    expect(run.status).toBe("COMPLETED");
    expect(executionOrder[0]).toBe("start");
    expect(executionOrder.slice(1, 3).sort()).toEqual(["branch_left", "branch_right"].sort());
    expect(executionOrder[3]).toBe("join");
  });
});
