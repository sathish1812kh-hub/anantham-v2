import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../../src/persistence/migration-engine.js";
import { WorkflowRepository } from "../../../src/persistence/repositories/workflow-repository.js";
import { ProjectRepository } from "../../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../../src/persistence/repositories/session-repository.js";
import { EventStore } from "../../../src/event-state/event-store.js";
import { WorkflowRegistry } from "../../../src/workflow/workflow-registry.js";
import { WorkflowEngine } from "../../../src/workflow/workflow-engine.js";
import { defineWorkflow, task, foreach } from "../../../src/workflow/workflow-dsl.js";

describe("P7.2 Workflow Engine — Foreach Bounded Expansion & Aggregation", () => {
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

  it("expands a foreach collection with deterministic item keys and aggregates results", async () => {
    const itemLogs: any[] = [];

    const foreachDispatcher = async (node: any, _run: any, context: any) => {
      if (node.id === "prepare_items") {
        return {
          status: "completed" as const,
          result: ["file1.ts", "file2.ts", "file3.ts"],
          tokensUsed: 50,
        };
      }
      itemLogs.push({ index: context.itemIndex, value: context.itemValue });
      return {
        status: "completed" as const,
        result: { processed: true, file: context.itemValue },
        tokensUsed: 30,
      };
    };

    const wf = defineWorkflow({
      id: "wf_foreach_01",
      projectId: "proj_01",
      name: "foreach-pipeline",
      version: "1.0.0",
      tasks: [
        task("prepare_items", { agentId: "agent_prep" }),
        foreach(
          "process_all_files",
          "prepare_items",
          "current_file",
          task("process_item", { agentId: "agent_worker" }),
          { maxConcurrency: 2, dependsOn: ["prepare_items"] }
        ),
      ],
    });

    const workflowEngine = new WorkflowEngine({
      workflowRepo,
      registry,
      taskDispatcher: foreachDispatcher,
    });

    const run = await workflowEngine.startWorkflow(wf, "sess_01");
    expect(run.status).toBe("COMPLETED");
    expect(itemLogs).toHaveLength(3);
    expect(itemLogs[0]).toEqual({ index: 0, value: "file1.ts" });

    const feState = run.foreachStates["process_all_files"];
    expect(feState).toBeDefined();
    expect(feState?.totalItems).toBe(3);
    expect(feState?.completedItems).toBe(3);
    expect(feState?.failedItems).toBe(0);
    expect(feState?.itemResults["item_0"]).toEqual({ processed: true, file: "file1.ts" });
  });

  it("rejects runaway collection exceeding max item bounds (>50)", async () => {
    const largeList = Array.from({ length: 55 }, (_, i) => `item_${i}`);

    const runawayDispatcher = async (node: any) => {
      if (node.id === "gen_large_list") {
        return { status: "completed" as const, result: largeList };
      }
      return { status: "completed" as const, result: {} };
    };

    const wf = defineWorkflow({
      id: "wf_runaway_foreach",
      projectId: "proj_01",
      name: "runaway-pipeline",
      version: "1.0.0",
      tasks: [
        task("gen_large_list", { agentId: "agent_gen" }),
        foreach(
          "process_runaway",
          "gen_large_list",
          "item",
          task("worker", { agentId: "agent_worker" }),
          { dependsOn: ["gen_large_list"] }
        ),
      ],
    });

    const workflowEngine = new WorkflowEngine({
      workflowRepo,
      registry,
      taskDispatcher: runawayDispatcher,
    });

    const run = await workflowEngine.startWorkflow(wf, "sess_01");
    expect(run.status).toBe("FAILED");
    expect(run.errorMessage).toContain("exceeding maximum allowed limit");
  });
});
