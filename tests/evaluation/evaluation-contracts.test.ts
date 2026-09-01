import { describe, it, expect } from "vitest";
import {
  BenchmarkCaseSchema,
  BenchmarkDatasetSchema,
  EvaluationAssertionSchema,
  EvaluationCaseResultSchema,
  EvaluationRunSchema,
  EvaluationReportSchema,
} from "../../src/domain/evaluation.js";

describe("P9.1 Evaluation — Domain Contracts & Schemas", () => {
  it("validates EvaluationAssertionSchema", () => {
    const valid = {
      id: "asrt_01",
      type: "STATE_EQUALS",
      target: "task.status",
      expected: "completed",
      description: "Task must reach completed state.",
      criticality: "CRITICAL",
    };
    const parsed = EvaluationAssertionSchema.parse(valid);
    expect(parsed.type).toBe("STATE_EQUALS");
  });

  it("validates BenchmarkCaseSchema", () => {
    const valid = {
      caseId: "case_01",
      datasetId: "ds_01",
      datasetVersion: "1.0.0",
      name: "Test Case",
      description: "A test case",
      category: "task_execution",
      difficulty: "MEDIUM",
      scenario: "Run a task",
      inputs: {},
      requiredTools: [],
      requiredCapabilities: [],
      assertions: [
        {
          id: "asrt_1",
          type: "STATE_EQUALS",
          target: "status",
          expected: "completed",
          description: "Status is completed",
        },
      ],
      timeoutMs: 10000,
      tags: ["test"],
    };
    const parsed = BenchmarkCaseSchema.parse(valid);
    expect(parsed.name).toBe("Test Case");
  });

  it("validates BenchmarkDatasetSchema", () => {
    const valid = {
      datasetId: "ds_01",
      version: "1.0.0",
      name: "Core Benchmark",
      description: "Core benchmark suite",
      cases: [],
    };
    const parsed = BenchmarkDatasetSchema.parse(valid);
    expect(parsed.version).toBe("1.0.0");
  });

  it("validates EvaluationCaseResultSchema", () => {
    const valid = {
      caseId: "case_01",
      status: "PASS",
      score: 100,
      assertionResults: [],
      evidence: {},
      failureClassification: "NONE",
      durationMs: 125,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
    const parsed = EvaluationCaseResultSchema.parse(valid);
    expect(parsed.status).toBe("PASS");
  });

  it("validates EvaluationRunSchema & EvaluationReportSchema", () => {
    const validRun = {
      id: "run_01",
      datasetId: "ds_01",
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
      results: [],
      provenance: {
        runtimeVersion: "2.0.0",
        gitCommit: "abc1234",
        datasetId: "ds_01",
        datasetVersion: "1.0.0",
        modelProfile: "default",
        environment: "node-test",
      },
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };

    const run = EvaluationRunSchema.parse(validRun);
    expect(run.status).toBe("COMPLETED");

    const report = EvaluationReportSchema.parse({
      reportId: "rep_01",
      runId: "run_01",
      generatedAt: new Date().toISOString(),
      run,
    });
    expect(report.runId).toBe("run_01");
  });
});
