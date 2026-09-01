import { describe, it, expect } from "vitest";
import { RegressionEngine } from "../../src/evaluation/regression-engine.js";
import { type EvaluationRun } from "../../src/domain/evaluation.js";

describe("P9.1 Evaluation — Regression Comparison Engine", () => {
  it("identifies new failures, fixed failures, and score deltas between runs", () => {
    const baselineRun: EvaluationRun = {
      id: "run_base",
      datasetId: "dataset_core_v1",
      datasetVersion: "1.0.0",
      status: "COMPLETED",
      summary: {
        totalCases: 2,
        passedCases: 2,
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
          assertionResults: [],
          evidence: {},
          failureClassification: "NONE",
          durationMs: 50,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
        {
          caseId: "core_workflow_01",
          status: "PASS",
          score: 100,
          assertionResults: [],
          evidence: {},
          failureClassification: "NONE",
          durationMs: 60,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      ],
      provenance: {
        runtimeVersion: "2.0.0",
        gitCommit: "base123",
        datasetId: "dataset_core_v1",
        datasetVersion: "1.0.0",
        modelProfile: "default",
        environment: "node-test",
      },
      createdAt: new Date().toISOString(),
    };

    const currentRun: EvaluationRun = {
      id: "run_curr",
      datasetId: "dataset_core_v1",
      datasetVersion: "1.0.0",
      status: "FAILED",
      summary: {
        totalCases: 2,
        passedCases: 1,
        failedCases: 1,
        partialCases: 0,
        inconclusiveCases: 0,
        overallScore: 50,
      },
      results: [
        {
          caseId: "core_task_01",
          status: "PASS",
          score: 100,
          assertionResults: [],
          evidence: {},
          failureClassification: "NONE",
          durationMs: 45,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
        {
          caseId: "core_workflow_01",
          status: "FAIL",
          score: 0,
          assertionResults: [],
          evidence: {},
          failureClassification: "ASSERTION",
          durationMs: 60,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      ],
      provenance: {
        runtimeVersion: "2.0.0",
        gitCommit: "curr456",
        datasetId: "dataset_core_v1",
        datasetVersion: "1.0.0",
        modelProfile: "default",
        environment: "node-test",
      },
      createdAt: new Date().toISOString(),
    };

    const regression = RegressionEngine.compare(baselineRun, currentRun);

    expect(regression.regressionDetected).toBe(true);
    expect(regression.scoreDelta).toBe(-50);
    expect(regression.newFailures).toContain("core_workflow_01");
    expect(regression.fixedFailures.length).toBe(0);
  });
});
