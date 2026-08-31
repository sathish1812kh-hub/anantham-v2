import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../../src/persistence/migration-engine.js";
import { WorkflowRepository } from "../../../src/persistence/repositories/workflow-repository.js";
import { ProjectRepository } from "../../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../../src/persistence/repositories/session-repository.js";
import { EventStore } from "../../../src/event-state/event-store.js";
import { WorkflowRegistry } from "../../../src/workflow/workflow-registry.js";
import { WorkflowEngine } from "../../../src/workflow/workflow-engine.js";
import { WorkflowExecutor } from "../../../src/workflow/workflow-executor.js";
import { defineWorkflow, task } from "../../../src/workflow/workflow-dsl.js";

describe("P7.2 Workflow Engine — Cancellation Cascading", () => {
  let engine: SqliteEngine;
  let workflowRepo: WorkflowRepository;
  let registry: WorkflowRegistry;
  let eventStore: EventStore;

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

    eventStore = new EventStore(engine);
    workflowRepo = new WorkflowRepository(engine);
    registry = new WorkflowRegistry({ workflowRepo, eventStore });
  });

  afterEach(() => {
    engine.close();
  });

  it("cooperatively aborts workflow execution via AbortSignal", async () => {
    const abortController = new AbortController();

    const longDispatcher = async (node: any) => {
      if (node.id === "step1") {
        // Abort while running step 1
        abortController.abort();
      }
      return { status: "completed" as const, result: {} };
    };

    const wf = defineWorkflow({
      id: "wf_abort_01",
      projectId: "proj_01",
      name: "abort-pipeline",
      version: "1.0.0",
      tasks: [
        task("step1", { agentId: "agent_1" }),
        task("step2", { agentId: "agent_2", dependsOn: ["step1"] }),
      ],
    });

    const executor = new WorkflowExecutor({
      workflowRepo,
      eventStore,
      taskDispatcher: longDispatcher,
    });

    registry.register(wf);
    const run = registry.createWorkflowRun(wf, "sess_01");
    const resultRun = await executor.execute(run, wf, { abortSignal: abortController.signal });

    expect(resultRun.status).toBe("CANCELLED");
    expect(resultRun.completedTasks).not.toContain("step2");
  });
});
