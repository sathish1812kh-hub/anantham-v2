import { describe, it, expect } from "vitest";
import { EvaluationHarness } from "../../src/evaluation/evaluation-harness.js";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { type BenchmarkCase } from "../../src/domain/evaluation.js";

describe("P9.1 Evaluation — Objective Scoring & Pass/Fail Thresholds", () => {
  let engine: SqliteEngine;
  let eventStore: EventStore;
  let harness: EvaluationHarness;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();
    eventStore = new EventStore(engine);
    harness = new EvaluationHarness({ engine, eventStore });
  });

  afterEach(() => {
    engine.close();
  });

  it("assigns PASS (score 100) when all critical and optional assertions pass", async () => {
    const benchCase: BenchmarkCase = {
      caseId: "score_pass_01",
      datasetId: "ds_score",
      datasetVersion: "1.0.0",
      name: "Pass Case",
      description: "Case where assertions pass",
      category: "task_execution",
      difficulty: "EASY",
      scenario: "Run task",
      inputs: {},
      requiredTools: [],
      requiredCapabilities: [],
      assertions: [
        {
          id: "asrt_crit",
          type: "STATE_EQUALS",
          target: "task.status",
          expected: "completed",
          description: "Task is completed",
          criticality: "CRITICAL",
        },
      ],
      timeoutMs: 5000,
      tags: [],
    };

    const result = await harness.executeCase(benchCase, {
      projectId: "proj_score",
      sessionId: "sess_score",
      executor: async (_c, ctx) => {
        ctx.evidenceCollector.recordState("task.status", "completed");
      },
    });

    expect(result.status).toBe("PASS");
    expect(result.score).toBe(100);
    expect(result.failureClassification).toBe("NONE");
  });

  it("assigns FAIL (score 0) when critical assertion fails", async () => {
    const benchCase: BenchmarkCase = {
      caseId: "score_fail_01",
      datasetId: "ds_score",
      datasetVersion: "1.0.0",
      name: "Fail Case",
      description: "Case where critical assertion fails",
      category: "task_execution",
      difficulty: "EASY",
      scenario: "Run task",
      inputs: {},
      requiredTools: [],
      requiredCapabilities: [],
      assertions: [
        {
          id: "asrt_crit",
          type: "STATE_EQUALS",
          target: "task.status",
          expected: "completed",
          description: "Task must complete",
          criticality: "CRITICAL",
        },
      ],
      timeoutMs: 5000,
      tags: [],
    };

    const result = await harness.executeCase(benchCase, {
      projectId: "proj_score",
      sessionId: "sess_score",
      executor: async (_c, ctx) => {
        ctx.evidenceCollector.recordState("task.status", "failed");
      },
    });

    expect(result.status).toBe("FAIL");
    expect(result.score).toBe(0);
    expect(result.failureClassification).toBe("ASSERTION");
  });
});
