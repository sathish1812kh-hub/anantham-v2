import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { EvaluationManager } from "../../src/evaluation/evaluation-manager.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";

describe("P9.1 Evaluation — Real End-to-End Evaluation Acceptance Scenario", () => {
  let engine: SqliteEngine;
  let eventStore: EventStore;
  let taskRepo: TaskRepository;
  let evalManager: EvaluationManager;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();
    eventStore = new EventStore(engine);
    taskRepo = new TaskRepository(engine);

    evalManager = new EvaluationManager({
      engine,
      eventStore,
    });
  });

  afterEach(() => {
    engine.close();
  });

  it("executes benchmark dataset, persists run, evaluates objective assertions, and generates report", async () => {
    // 1. Execute Core Dataset with executors recording actual runtime operations
    const run1 = await evalManager.runEvaluation("dataset_core_v1", {
      executors: {
        core_task_01: async (_c, ctx) => {
          // Perform runtime operation: save task and mark completed
          ctx.evidenceCollector.recordState("task.status", "completed");
          eventStore.append({
            id: "evt_eval_task_comp",
            schemaVersion: 1,
            projectId: ctx.projectId,
            sessionId: ctx.sessionId,
            type: "task.completed",
            actor: "agent",
            timestamp: new Date().toISOString(),
            payload: {},
          });
        },
        core_workflow_01: async (_c, ctx) => {
          ctx.evidenceCollector.recordState("workflow.status", "COMPLETED");
        },
      },
    });

    expect(run1.status).toBe("COMPLETED");
    expect(run1.summary.totalCases).toBe(2);
    expect(run1.summary.passedCases).toBe(2);
    expect(run1.summary.overallScore).toBe(100);

    // 2. Generate Report
    const report1 = evalManager.generateReport(run1.id);
    expect(report1.runId).toBe(run1.id);
    expect(report1.run.summary.overallScore).toBe(100);

    // 3. Execute Run 2 (Simulating a regression in workflow step)
    const run2 = await evalManager.runEvaluation("dataset_core_v1", {
      executors: {
        core_task_01: async (_c, ctx) => {
          ctx.evidenceCollector.recordState("task.status", "completed");
          eventStore.append({
            id: "evt_eval_task_comp_2",
            schemaVersion: 1,
            projectId: ctx.projectId,
            sessionId: ctx.sessionId,
            type: "task.completed",
            actor: "agent",
            timestamp: new Date().toISOString(),
            payload: {},
          });
        },
        core_workflow_01: async (_c, ctx) => {
          ctx.evidenceCollector.recordState("workflow.status", "FAILED");
        },
      },
    });

    expect(run2.status).toBe("FAILED");
    expect(run2.summary.failedCases).toBe(1);

    // 4. Generate Report comparing Run 2 against Run 1 baseline
    const report2 = evalManager.generateReport(run2.id, run1.id);
    expect(report2.regression).toBeDefined();
    expect(report2.regression?.regressionDetected).toBe(true);
    expect(report2.regression?.newFailures).toContain("core_workflow_01");
  });
});
