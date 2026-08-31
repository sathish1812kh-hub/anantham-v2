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

describe("P7.2 Workflow Engine — Restart-Safe Human Approval Gates", () => {
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

  it("pauses execution in WAITING_APPROVAL, survives pause, and resumes upon explicit approval", async () => {
    const wf = defineWorkflow({
      id: "wf_approval_01",
      projectId: "proj_01",
      name: "prod-deploy-pipeline",
      version: "1.0.0",
      tasks: [
        task("build_artifact", { agentId: "agent_builder" }),
        approve(
          "prod_approval",
          "Authorize production release deployment",
          { requiredRole: "release_manager", dependsOn: ["build_artifact"] }
        ),
        task("deploy_prod", {
          agentId: "agent_deployer",
          dependsOn: ["prod_approval"],
        }),
      ],
    });

    // 1. Start workflow - should pause at approve node
    const run = await workflowEngine.startWorkflow(wf, "sess_01");
    expect(run.status).toBe("WAITING_APPROVAL");
    expect(run.completedTasks).toContain("build_artifact");
    expect(run.completedTasks).not.toContain("deploy_prod");
    expect(run.approvalGate).toBeDefined();
    expect(run.approvalGate?.nodeId).toBe("prod_approval");

    // 2. Authorize approval gate
    const resumedRun = await workflowEngine.approveGate(run.id, "prod_approval", {
      decision: "APPROVED",
      approverId: "user_lead_eng",
      notes: "Passed staging verification",
    });

    expect(resumedRun.status).toBe("COMPLETED");
    expect(resumedRun.completedTasks).toContain("prod_approval");
    expect(resumedRun.completedTasks).toContain("deploy_prod");
    expect(resumedRun.approvalGate?.decision).toBe("APPROVED");
    expect(resumedRun.approvalGate?.approvedBy).toBe("user_lead_eng");
  });

  it("terminates workflow with FAILED status when approval gate is rejected", async () => {
    const wf = defineWorkflow({
      id: "wf_approval_reject",
      projectId: "proj_01",
      name: "reject-pipeline",
      version: "1.0.0",
      tasks: [
        task("build_artifact", { agentId: "agent_builder" }),
        approve(
          "prod_approval",
          "Authorize production release deployment",
          { dependsOn: ["build_artifact"] }
        ),
        task("deploy_prod", { agentId: "agent_deployer", dependsOn: ["prod_approval"] }),
      ],
    });

    const run = await workflowEngine.startWorkflow(wf, "sess_01");
    expect(run.status).toBe("WAITING_APPROVAL");

    const rejectedRun = await workflowEngine.approveGate(run.id, "prod_approval", {
      decision: "REJECTED",
      approverId: "security_auditor",
      notes: "Failed CVE security scan.",
    });

    expect(rejectedRun.status).toBe("FAILED");
    expect(rejectedRun.errorMessage).toContain("Approval gate rejected");
    expect(rejectedRun.completedTasks).not.toContain("deploy_prod");
    expect(rejectedRun.approvalGate?.decision).toBe("REJECTED");
  });
});
