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

describe("P7.2 Workflow Engine — Conditional Branching & Node Skipping", () => {
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

  it("skips node when condition evaluates to false and continues downstream execution", async () => {
    const executedNodes: string[] = [];

    const conditionalDispatcher = async (node: any) => {
      executedNodes.push(node.id);
      if (node.id === "run_tests") {
        return { status: "completed" as const, result: { pass: true, failures: 0 } };
      }
      return { status: "completed" as const, result: { executed: true } };
    };

    const wf = defineWorkflow({
      id: "wf_conditional_01",
      projectId: "proj_01",
      name: "conditional-pipeline",
      version: "1.0.0",
      tasks: [
        task("run_tests", { agentId: "agent_tester" }),
        // Should execute because pass == true
        task("notify_success", {
          agentId: "agent_notifier",
          condition: {
            type: "expression",
            expression: "run_tests.pass == true",
          },
          dependsOn: ["run_tests"],
        }),
        // Should be SKIPPED because failures == 0
        task("notify_failure", {
          agentId: "agent_notifier",
          condition: {
            type: "expression",
            expression: "run_tests.failures > 0",
          },
          dependsOn: ["run_tests"],
        }),
        // Should execute because notify_success is completed and notify_failure is skipped
        task("final_step", {
          agentId: "agent_final",
          dependsOn: ["notify_success", "notify_failure"],
        }),
      ],
    });

    const workflowEngine = new WorkflowEngine({
      workflowRepo,
      registry,
      taskDispatcher: conditionalDispatcher,
    });

    const run = await workflowEngine.startWorkflow(wf, "sess_01");
    expect(run.status).toBe("COMPLETED");
    expect(executedNodes).toContain("run_tests");
    expect(executedNodes).toContain("notify_success");
    expect(executedNodes).not.toContain("notify_failure");
    expect(executedNodes).toContain("final_step");

    expect(run.nodeStates["notify_failure"]?.status).toBe("SKIPPED");
    expect(run.nodeStates["notify_success"]?.status).toBe("COMPLETED");
    expect(run.nodeStates["final_step"]?.status).toBe("COMPLETED");
  });
});
