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

describe("P7.2 Workflow Engine — Hierarchical Budget Enforcement", () => {
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

  it("fails workflow execution when token budget limit is exceeded", async () => {
    const greedyDispatcher = async (_node: any) => {
      return { status: "completed" as const, result: {}, tokensUsed: 800 };
    };

    const wf = defineWorkflow({
      id: "wf_budget_tokens",
      projectId: "proj_01",
      name: "budget-limited-wf",
      version: "1.0.0",
      budget: {
        maxTokens: 500, // Small limit
      },
      tasks: [
        task("task1", { agentId: "agent_1", budgetTokens: 600 }),
      ],
    });

    const workflowEngine = new WorkflowEngine({
      workflowRepo,
      registry,
      taskDispatcher: greedyDispatcher,
    });

    const run = await workflowEngine.startWorkflow(wf, "sess_01");
    expect(run.status).toBe("FAILED");
    expect(run.nodeStates["task1"]?.error).toContain("Token budget exceeded");
  });

  it("accumulates and tracks resource consumption across completed tasks", async () => {
    const customDispatcher = async (_node: any) => {
      return { status: "completed" as const, result: {}, tokensUsed: 150, costUsd: 0.005 };
    };

    const wf = defineWorkflow({
      id: "wf_budget_track",
      projectId: "proj_01",
      name: "budget-track-wf",
      version: "1.0.0",
      budget: {
        maxTokens: 10000,
        maxCostUsd: 1.0,
      },
      tasks: [
        task("t1", { agentId: "agent_1" }),
        task("t2", { agentId: "agent_2", dependsOn: ["t1"] }),
      ],
    });

    const workflowEngine = new WorkflowEngine({
      workflowRepo,
      registry,
      taskDispatcher: customDispatcher,
    });

    const run = await workflowEngine.startWorkflow(wf, "sess_01");
    expect(run.status).toBe("COMPLETED");
    expect(run.budgetConsumption.tokens).toBe(300);
    expect(run.budgetConsumption.costUsd).toBeCloseTo(0.01);
    expect(run.budgetConsumption.toolCalls).toBe(2);
  });
});
