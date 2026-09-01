import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { EvaluationRepository } from "../../src/persistence/repositories/evaluation-repository.js";
import { type EvaluationRun } from "../../src/domain/evaluation.js";

describe("P9.1 Evaluation — SQLite Persistence & Durability", () => {
  let engine: SqliteEngine;
  let repo: EvaluationRepository;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();
    repo = new EvaluationRepository(engine);
  });

  afterEach(() => {
    engine.close();
  });

  it("persists evaluation run and child case results transactionally", () => {
    const run: EvaluationRun = {
      id: "run_persist_01",
      datasetId: "dataset_core_v1",
      datasetVersion: "1.0.0",
      status: "COMPLETED",
      summary: {
        totalCases: 1,
        passedCases: 1,
        failedCases: 0,
        partialCases: 0,
        inconclusiveCases: 0,
        overallScore: 100,
      },
      results: [
        {
          caseId: "core_task_01",
          status: "PASS",
          score: 100,
          assertionResults: [
            {
              assertionId: "asrt_1",
              passed: true,
              expected: "completed",
              observed: "completed",
              evidence: "Task completed",
              criticality: "CRITICAL",
            },
          ],
          evidence: { taskStatus: "completed" },
          failureClassification: "NONE",
          durationMs: 42,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      ],
      provenance: {
        runtimeVersion: "2.0.0",
        gitCommit: "de6bf08",
        datasetId: "dataset_core_v1",
        datasetVersion: "1.0.0",
        modelProfile: "default",
        environment: "node-test",
      },
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };

    repo.saveRun(run);

    const fetched = repo.findRunById("run_persist_01");
    expect(fetched).toBeDefined();
    expect(fetched?.id).toBe("run_persist_01");
    expect(fetched?.summary.overallScore).toBe(100);
    expect(fetched?.results.length).toBe(1);
    expect(fetched?.results[0]!.caseId).toBe("core_task_01");
    expect(fetched?.results[0]!.assertionResults[0]!.passed).toBe(true);
  });
});
