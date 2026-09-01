import { describe, it, expect, beforeEach } from "vitest";
import { BenchmarkRegistry } from "../../src/evaluation/benchmark-registry.js";
import { type BenchmarkDataset } from "../../src/domain/evaluation.js";

describe("P9.1 Evaluation — Benchmark Registry", () => {
  let registry: BenchmarkRegistry;

  beforeEach(() => {
    registry = new BenchmarkRegistry();
  });

  it("loads standard core, security, and recovery benchmark suites", () => {
    const datasets = registry.listDatasets();
    expect(datasets.length).toBeGreaterThanOrEqual(3);

    const core = registry.getDataset("dataset_core_v1");
    expect(core).toBeDefined();
    expect(core?.cases.length).toBeGreaterThanOrEqual(2);

    const sec = registry.getDataset("dataset_security_v1");
    expect(sec).toBeDefined();
    expect(sec?.cases.length).toBeGreaterThanOrEqual(3);

    const rec = registry.getDataset("dataset_recovery_v1");
    expect(rec).toBeDefined();
    expect(rec?.cases.length).toBeGreaterThanOrEqual(1);
  });

  it("allows registering and retrieving custom versioned datasets", () => {
    const customDs: BenchmarkDataset = {
      datasetId: "dataset_custom_v1",
      version: "2.1.0",
      name: "Custom Evaluation",
      description: "Custom tests",
      cases: [],
    };

    registry.registerDataset(customDs);
    const fetched = registry.getDataset("dataset_custom_v1", "2.1.0");
    expect(fetched).toBeDefined();
    expect(fetched?.name).toBe("Custom Evaluation");
  });

  it("retrieves specific case by datasetId and caseId", () => {
    const benchCase = registry.getCase("dataset_core_v1", "core_task_01");
    expect(benchCase).toBeDefined();
    expect(benchCase?.name).toBe("Simple Task Execution");
  });
});
