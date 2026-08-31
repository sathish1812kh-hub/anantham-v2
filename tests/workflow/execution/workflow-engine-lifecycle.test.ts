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

describe("P7.2 Workflow Engine — Lifecycle State Transitions", () => {
  let engine: SqliteEngine;
  let workflowRepo: WorkflowRepository;
  let registry: WorkflowRegistry;
  let eventStore: EventStore;
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

    eventStore = new EventStore(engine);
    workflowRepo = new WorkflowRepository(engine);
    registry = new WorkflowRegistry({ workflowRepo, eventStore });
    workflowEngine = new WorkflowEngine({ workflowRepo, registry, eventStore });
  });

  afterEach(() => {
    engine.close();
  });

  it("starts and completes a linear workflow run successfully", async () => {
    const wf = defineWorkflow({
      id: "wf_lifecycle_01",
      projectId: "proj_01",
      name: "build-and-test",
      version: "1.0.0",
      tasks: [
        task("step1", { agentId: "agent_1" }),
        task("step2", { agentId: "agent_2", dependsOn: ["step1"] }),
      ],
    });

    const run = await workflowEngine.startWorkflow(wf, "sess_01");
    expect(run.status).toBe("COMPLETED");
    expect(run.completedTasks).toEqual(["step1", "step2"]);
    expect(run.completedAt).toBeDefined();

    const stored = workflowEngine.getRunStatus(run.id);
    expect(stored?.status).toBe("COMPLETED");
    expect(stored?.completedTasks).toHaveLength(2);
  });

  it("pauses and resumes a workflow run", async () => {
    const wf = defineWorkflow({
      id: "wf_lifecycle_02",
      projectId: "proj_01",
      name: "pausable-workflow",
      version: "1.0.0",
      tasks: [
        task("stepA", { agentId: "agent_1" }),
        task("stepB", { agentId: "agent_2", dependsOn: ["stepA"] }),
      ],
    });
    registry.register(wf);

    // Create run
    const initialRun = registry.createWorkflowRun(wf, "sess_01");
    expect(initialRun.status).toBe("QUEUED");

    const pausedRun = await workflowEngine.pauseWorkflow(initialRun.id, "Maintenance pause");
    expect(pausedRun.status).toBe("PAUSED");

    const resumedRun = await workflowEngine.resumeWorkflow(initialRun.id);
    expect(resumedRun.status).toBe("COMPLETED");
    expect(resumedRun.completedTasks).toContain("stepA");
    expect(resumedRun.completedTasks).toContain("stepB");
  });

  it("cancels an active workflow run", async () => {
    const wf = defineWorkflow({
      id: "wf_lifecycle_03",
      projectId: "proj_01",
      name: "cancellable-workflow",
      version: "1.0.0",
      tasks: [
        task("stepX", { agentId: "agent_1" }),
      ],
    });
    registry.register(wf);

    const initialRun = registry.createWorkflowRun(wf, "sess_01");
    initialRun.status = "RUNNING";
    initialRun.runningTasks = ["stepX"];
    workflowRepo.saveWorkflowRun(initialRun);

    const cancelledRun = await workflowEngine.cancelWorkflow(initialRun.id, "User requested cancellation");
    expect(cancelledRun.status).toBe("CANCELLED");
    expect(cancelledRun.errorMessage).toBe("User requested cancellation");
    expect(cancelledRun.runningTasks).toHaveLength(0);
    expect(cancelledRun.nodeStates["stepX"]?.status).toBe("CANCELLED");
  });
});
