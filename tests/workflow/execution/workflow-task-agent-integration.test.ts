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

describe("P7.2 Workflow Engine — Task & Agent Integration", () => {
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

  it("passes inputs and outputs cleanly between dependent tasks", async () => {
    const executedPayloads: Record<string, any> = {};

    const integratedDispatcher = async (node: any, run: any) => {
      executedPayloads[node.id] = {
        agentId: node.agentId,
        inputs: node.inputs,
        upstreamResults: run.taskResults,
      };

      if (node.id === "producer") {
        return {
          status: "completed" as const,
          result: { generatedArtifact: "art_model_weights_01", accuracy: 0.98 },
          tokensUsed: 200,
        };
      }

      if (node.id === "consumer") {
        const producerData = run.taskResults["producer"];
        return {
          status: "completed" as const,
          result: { consumedArtifact: producerData?.generatedArtifact, verified: true },
          tokensUsed: 150,
        };
      }

      return { status: "completed" as const, result: {} };
    };

    const wf = defineWorkflow({
      id: "wf_integration_01",
      projectId: "proj_01",
      name: "producer-consumer-pipeline",
      version: "1.0.0",
      tasks: [
        task("producer", {
          agentId: "agent_ml_trainer",
          inputs: { dataset: "mnist" },
          outputs: ["art_model_weights_01"],
        }),
        task("consumer", {
          agentId: "agent_evaluator",
          inputs: { mode: "benchmark" },
          dependsOn: ["producer"],
        }),
      ],
    });

    const workflowEngine = new WorkflowEngine({
      workflowRepo,
      registry,
      taskDispatcher: integratedDispatcher,
    });

    const run = await workflowEngine.startWorkflow(wf, "sess_01");
    expect(run.status).toBe("COMPLETED");
    expect(run.taskResults["producer"]).toEqual({
      generatedArtifact: "art_model_weights_01",
      accuracy: 0.98,
    });
    expect(run.taskResults["consumer"]).toEqual({
      consumedArtifact: "art_model_weights_01",
      verified: true,
    });
  });
});
