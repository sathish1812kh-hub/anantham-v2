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

describe("P7.2 Workflow Engine — Classified Failures & Bounded Retries", () => {
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

  it("retries transient failures and succeeds on subsequent attempt", async () => {
    let callCount = 0;

    const flakyDispatcher = async () => {
      callCount++;
      if (callCount < 3) {
        return { status: "failed" as const, error: "Rate limit 429: Too Many Requests" };
      }
      return { status: "completed" as const, result: { success: true } };
    };

    const wf = defineWorkflow({
      id: "wf_retry_success",
      projectId: "proj_01",
      name: "retry-pipeline",
      version: "1.0.0",
      tasks: [
        task("flaky_task", {
          agentId: "agent_api",
          maxRetries: 3,
        }),
      ],
    });

    const workflowEngine = new WorkflowEngine({
      workflowRepo,
      registry,
      taskDispatcher: flakyDispatcher,
    });

    const run = await workflowEngine.startWorkflow(wf, "sess_01");
    expect(run.status).toBe("COMPLETED");
    expect(callCount).toBe(3);
    expect(run.nodeStates["flaky_task"]?.attempts).toBe(3);
  });

  it("fails closed immediately on policy denial without retrying", async () => {
    let callCount = 0;

    const policyDeniedDispatcher = async () => {
      callCount++;
      return { status: "failed" as const, error: "Security violation: Policy denied tool execution." };
    };

    const wf = defineWorkflow({
      id: "wf_policy_denial",
      projectId: "proj_01",
      name: "policy-denied-pipeline",
      version: "1.0.0",
      tasks: [
        task("denied_task", {
          agentId: "agent_rogue",
          maxRetries: 5,
        }),
      ],
    });

    const workflowEngine = new WorkflowEngine({
      workflowRepo,
      registry,
      taskDispatcher: policyDeniedDispatcher,
    });

    const run = await workflowEngine.startWorkflow(wf, "sess_01");
    expect(run.status).toBe("FAILED");
    // Should have failed on attempt 1 without attempting 5 retries!
    expect(callCount).toBe(1);
    expect(run.nodeStates["denied_task"]?.attempts).toBe(1);
    expect(run.nodeStates["denied_task"]?.error).toContain("Policy denied");
  });
});
