import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../../src/persistence/migration-engine.js";
import { WorkflowRepository } from "../../../src/persistence/repositories/workflow-repository.js";
import { ProjectRepository } from "../../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../../src/persistence/repositories/session-repository.js";
import { EventStore } from "../../../src/event-state/event-store.js";
import { WorkflowRegistry } from "../../../src/workflow/workflow-registry.js";
import { WorkflowEngine } from "../../../src/workflow/workflow-engine.js";
import { defineWorkflow, task, parallel, verify, approve } from "../../../src/workflow/workflow-dsl.js";

describe("P7.2 Real Workflow Acceptance — Full Multi-Agent Pipeline", () => {
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
      id: "proj_anantham_acceptance",
      name: "Anantham Acceptance",
      rootPath: "/acceptance",
      status: "active",
      tags: ["acceptance", "p7.2"],
      modelProfile: "claude-3-5-sonnet",
      memoryNamespace: "proj_acceptance",
      orchestrationProfile: "default",
      trustProfile: "developer",
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      metadata: {},
    });

    sessionRepo.save({
      id: "sess_acceptance_01",
      projectId: "proj_anantham_acceptance",
      name: "Acceptance Session",
      branch: "main",
      status: "active",
      modelProfile: "claude-3-5-sonnet",
      keyPoolProfile: "default",
      mode: "autonomous",
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

  it("executes full end-to-end multi-agent pipeline (Planner -> Parallel A&B -> Verify -> Approve -> Final Deploy)", async () => {
    const traceLog: string[] = [];

    const realMultiAgentDispatcher = async (node: any, run: any) => {
      traceLog.push(`START:${node.id}`);

      if (node.id === "planner") {
        return {
          status: "completed" as const,
          result: { plan: "Refactor database and add auth tokens", subTasks: ["schema_update", "api_tokens"] },
          tokensUsed: 300,
          costUsd: 0.003,
        };
      }

      if (node.id === "task_a") {
        await new Promise((r) => setTimeout(r, 40));
        return {
          status: "completed" as const,
          result: { schemaMigration: "007_tokens.ts", exitCode: 0 },
          tokensUsed: 250,
          costUsd: 0.0025,
        };
      }

      if (node.id === "task_b") {
        await new Promise((r) => setTimeout(r, 40));
        return {
          status: "completed" as const,
          result: { tokenEndpoint: "/api/v1/tokens", exitCode: 0 },
          tokensUsed: 200,
          costUsd: 0.002,
        };
      }

      if (node.id === "final_deploy") {
        const approvalData = run.approvalGate;
        return {
          status: "completed" as const,
          result: { deployed: true, authorizedBy: approvalData?.approvedBy },
          tokensUsed: 150,
          costUsd: 0.0015,
        };
      }

      return { status: "completed" as const, result: {} };
    };

    const wf = defineWorkflow({
      id: "wf_full_acceptance_01",
      projectId: "proj_anantham_acceptance",
      name: "enterprise-release-pipeline",
      version: "1.0.0",
      budget: {
        maxTokens: 50000,
        maxCostUsd: 2.0,
      },
      concurrency: {
        maxAgents: 4,
        maxParallelTasks: 8,
      },
      tasks: [
        task("planner", { agentId: "agent_architect" }),
        parallel(
          "parallel_work",
          [
            task("task_a", { agentId: "agent_db_dev" }),
            task("task_b", { agentId: "agent_api_dev" }),
          ],
          { maxConcurrency: 2, dependsOn: ["planner"] }
        ),
        verify(
          "verification_gate",
          ["parallel_work.task_a.exitCode == 0", "parallel_work.task_b.exitCode == 0"],
          { dependsOn: ["parallel_work"] }
        ),
        approve(
          "approval_gate",
          "Authorize production release after verification",
          { requiredRole: "release_manager", dependsOn: ["verification_gate"] }
        ),
        task("final_deploy", {
          agentId: "agent_deployer",
          dependsOn: ["approval_gate"],
        }),
      ],
    });

    const workflowEngine = new WorkflowEngine({
      workflowRepo,
      registry,
      eventStore,
      taskDispatcher: realMultiAgentDispatcher,
    });

    // 1. Start execution -> should pause at approval_gate
    const run = await workflowEngine.startWorkflow(wf, "sess_acceptance_01", {
      environmentContext: {
        pluginVersions: { "git-plugin": "2.1.0" },
        skillVersions: { "architecture-skill": "1.0.0" },
        modelProfile: "claude-3-5-sonnet",
      },
    });

    expect(run.status).toBe("WAITING_APPROVAL");
    expect(run.completedTasks).toContain("planner");
    expect(run.completedTasks).toContain("parallel_work");
    expect(run.completedTasks).toContain("verification_gate");
    expect(run.completedTasks).not.toContain("final_deploy");
    expect(run.approvalGate?.nodeId).toBe("approval_gate");
    expect(run.pinnedVersions.workflowVersion).toBe("1.0.0");
    expect(run.pinnedVersions.pluginVersions["git-plugin"]).toBe("2.1.0");

    // 2. Supply human authorization
    const finalRun = await workflowEngine.approveGate(run.id, "approval_gate", {
      decision: "APPROVED",
      approverId: "user_head_of_eng",
      notes: "Acceptance verification passed cleanly.",
    });

    expect(finalRun.status).toBe("COMPLETED");
    expect(finalRun.completedTasks).toContain("approval_gate");
    expect(finalRun.completedTasks).toContain("final_deploy");
    expect(finalRun.approvalGate?.decision).toBe("APPROVED");
    expect(finalRun.approvalGate?.approvedBy).toBe("user_head_of_eng");

    // Verify budget tracking
    expect(finalRun.budgetConsumption.tokens).toBeGreaterThan(0);
    expect(finalRun.budgetConsumption.costUsd).toBeGreaterThan(0);

    // Verify EventStore audit trail
    const events = eventStore.getEventsBySession("sess_acceptance_01");
    expect(events.length).toBeGreaterThan(5);
    expect(events.some((e) => e.type === "workflow.started")).toBe(true);
    expect(events.some((e) => e.type === "workflow.completed")).toBe(true);
  });
});
