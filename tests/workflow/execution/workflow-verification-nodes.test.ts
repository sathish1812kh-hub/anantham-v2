import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../../src/persistence/migration-engine.js";
import { WorkflowRepository } from "../../../src/persistence/repositories/workflow-repository.js";
import { ProjectRepository } from "../../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../../src/persistence/repositories/session-repository.js";
import { EventStore } from "../../../src/event-state/event-store.js";
import { WorkflowRegistry } from "../../../src/workflow/workflow-registry.js";
import { WorkflowEngine } from "../../../src/workflow/workflow-engine.js";
import { defineWorkflow, task, verify } from "../../../src/workflow/workflow-dsl.js";

describe("P7.2 Workflow Engine — Verification Nodes & Objective Proof Gates", () => {
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

  it("passes verify node when objective assertions evaluate to true", async () => {
    const customDispatcher = async (node: any) => {
      if (node.id === "build_service") {
        return { status: "completed" as const, result: { exitCode: 0, testCount: 50, pass: true } };
      }
      return { status: "completed" as const, result: {} };
    };

    const wf = defineWorkflow({
      id: "wf_verify_pass",
      projectId: "proj_01",
      name: "verify-pass-pipeline",
      version: "1.0.0",
      tasks: [
        task("build_service", { agentId: "agent_builder" }),
        verify(
          "verify_gate",
          ["build_service.exitCode == 0", "build_service.pass == true", "build_service.testCount >= 50"],
          { dependsOn: ["build_service"] }
        ),
      ],
    });

    const workflowEngine = new WorkflowEngine({
      workflowRepo,
      registry,
      taskDispatcher: customDispatcher,
    });

    const run = await workflowEngine.startWorkflow(wf, "sess_01");
    expect(run.status).toBe("COMPLETED");
    expect(run.completedTasks).toContain("verify_gate");
    expect(run.nodeStates["verify_gate"]?.status).toBe("COMPLETED");
  });

  it("fails verify node when an objective assertion fails", async () => {
    const customDispatcher = async (node: any) => {
      if (node.id === "build_service") {
        return { status: "completed" as const, result: { exitCode: 1, pass: false } };
      }
      return { status: "completed" as const, result: {} };
    };

    const wf = defineWorkflow({
      id: "wf_verify_fail",
      projectId: "proj_01",
      name: "verify-fail-pipeline",
      version: "1.0.0",
      tasks: [
        task("build_service", { agentId: "agent_builder" }),
        verify(
          "verify_gate",
          ["build_service.exitCode == 0", "build_service.pass == true"],
          { dependsOn: ["build_service"] }
        ),
      ],
    });

    const workflowEngine = new WorkflowEngine({
      workflowRepo,
      registry,
      taskDispatcher: customDispatcher,
    });

    const run = await workflowEngine.startWorkflow(wf, "sess_01");
    expect(run.status).toBe("FAILED");
    expect(run.nodeStates["verify_gate"]?.status).toBe("FAILED");
    expect(run.nodeStates["verify_gate"]?.error).toContain("failed assertions");
  });
});
