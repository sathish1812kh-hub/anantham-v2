import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { EvaluationManager } from "../../src/evaluation/evaluation-manager.js";

describe("P9.5 Evaluation — System-Level Benchmark Scenarios & Release Gates", () => {
  let engine: SqliteEngine;
  let eventStore: EventStore;
  let evalManager: EvaluationManager;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    eventStore = new EventStore(engine);
    evalManager = new EvaluationManager({
      engine,
      eventStore,
      gitCommit: "aec9f88",
      runtimeVersion: "2.0.0-alpha.1",
    });
  });

  afterEach(() => {
    engine.close();
  });

  it("registers and retrieves the comprehensive dataset_system_evaluation_v1 benchmark dataset", () => {
    const dataset = evalManager.registry.getDataset("dataset_system_evaluation_v1");
    expect(dataset).toBeDefined();
    expect(dataset?.cases.length).toBe(10);

    const caseIds = dataset?.cases.map((c) => c.caseId);
    expect(caseIds).toContain("sys_eval_resume_01");
    expect(caseIds).toContain("sys_eval_compaction_01");
    expect(caseIds).toContain("sys_eval_multimodal_01");
    expect(caseIds).toContain("sys_eval_failover_01");
    expect(caseIds).toContain("sys_eval_parallel_01");
    expect(caseIds).toContain("sys_eval_retrieval_01");
    expect(caseIds).toContain("sys_eval_false_completion_01");
    expect(caseIds).toContain("sys_eval_security_01");
    expect(caseIds).toContain("sys_eval_cost_01");
    expect(caseIds).toContain("sys_eval_recovery_01");
  });

  it("executes complete system-level benchmark suite and evaluates case results", async () => {
    const run = await evalManager.runEvaluation("dataset_system_evaluation_v1");

    expect(run.id).toBeDefined();
    expect(run.datasetId).toBe("dataset_system_evaluation_v1");
    expect(run.summary.totalCases).toBe(10);
    expect(run.summary.overallScore).toBeGreaterThanOrEqual(0);

    // Verify durable persistence in SQLite
    const persisted = evalManager.repository.findRunById(run.id);
    expect(persisted).toBeDefined();
    expect(persisted?.id).toBe(run.id);

    const caseResults = evalManager.repository.listCaseResultsByRun(run.id);
    expect(caseResults.length).toBe(10);
  });

  it("computes regression comparison between baseline and release candidate runs", async () => {
    const run1 = await evalManager.runEvaluation("dataset_system_evaluation_v1");
    const run2 = await evalManager.runEvaluation("dataset_system_evaluation_v1");

    const report = evalManager.generateReport(run2.id, run1.id);
    expect(report.runId).toBe(run2.id);
    expect(report.run.summary.totalCases).toBe(10);
    expect(report.regression).toBeDefined();
    expect(report.regression?.regressionDetected).toBe(false);
  });
});
