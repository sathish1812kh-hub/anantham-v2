import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../../src/persistence/migration-engine.js";
import { WorkflowRepository } from "../../../src/persistence/repositories/workflow-repository.js";
import { ProjectRepository } from "../../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../../src/persistence/repositories/session-repository.js";
import { EventStore } from "../../../src/event-state/event-store.js";
import { WorkflowRegistry } from "../../../src/workflow/workflow-registry.js";
import { WorkflowEngine } from "../../../src/workflow/workflow-engine.js";
import { defineWorkflow, task, approve } from "../../../src/workflow/workflow-dsl.js";

describe("P7.2 Workflow Engine — Adversarial Security & Boundary Testing", () => {
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

  it("blocks forged approval for a gate that does not exist or node mismatch", async () => {
    const wf = defineWorkflow({
      id: "wf_adv_01",
      projectId: "proj_01",
      name: "adv-approval",
      version: "1.0.0",
      tasks: [
        approve("real_gate", "Authorize change"),
      ],
    });

    const run = await workflowEngine.startWorkflow(wf, "sess_01");
    expect(run.status).toBe("WAITING_APPROVAL");

    // Attempt to approve non-existent gate
    await expect(
      workflowEngine.approveGate(run.id, "fake_gate", {
        decision: "APPROVED",
        approverId: "attacker",
      })
    ).rejects.toThrow("Approval gate mismatch");
  });

  it("blocks resume or approval call on a completed workflow run", async () => {
    const wf = defineWorkflow({
      id: "wf_adv_02",
      projectId: "proj_01",
      name: "completed-wf",
      version: "1.0.0",
      tasks: [
        task("done_task", { agentId: "agent_1" }),
      ],
    });

    const run = await workflowEngine.startWorkflow(wf, "sess_01");
    expect(run.status).toBe("COMPLETED");

    // Attempt to resume already completed workflow
    await expect(workflowEngine.resumeWorkflow(run.id)).rejects.toThrow("Cannot resume workflow run");
  });
});
