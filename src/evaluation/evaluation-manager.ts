import { randomUUID } from "node:crypto";
import { type SqliteEngine } from "../persistence/sqlite-engine.js";
import { type EventStore } from "../event-state/event-store.js";
import { EvaluationRepository } from "../persistence/repositories/evaluation-repository.js";
import { BenchmarkRegistry } from "./benchmark-registry.js";
import { EvaluationHarness, type BenchmarkCaseExecutor } from "./evaluation-harness.js";
import { RegressionEngine } from "./regression-engine.js";
import {
  type EvaluationRun,
  type EvaluationReport,
  EvaluationReportSchema,
} from "../domain/evaluation.js";

export interface EvaluationManagerOptions {
  engine: SqliteEngine;
  eventStore: EventStore;
  gitCommit?: string;
  runtimeVersion?: string;
}

/**
 * Central Evaluation Manager.
 * PRD Part 3 Section 80–120.
 */
export class EvaluationManager {
  public readonly registry: BenchmarkRegistry;
  public readonly repository: EvaluationRepository;
  public readonly harness: EvaluationHarness;

  constructor(options: EvaluationManagerOptions) {
    this.registry = new BenchmarkRegistry();
    this.repository = new EvaluationRepository(options.engine);
    this.harness = new EvaluationHarness({
      engine: options.engine,
      eventStore: options.eventStore,
      gitCommit: options.gitCommit,
      runtimeVersion: options.runtimeVersion,
    });
  }

  /**
   * Run a benchmark dataset, persist the results, and return the EvaluationRun.
   */
  public async runEvaluation(
    datasetId: string,
    options?: {
      version?: string;
      executors?: Record<string, BenchmarkCaseExecutor>;
    }
  ): Promise<EvaluationRun> {
    const dataset = this.registry.getDataset(datasetId, options?.version);
    if (!dataset) {
      throw new Error(`Benchmark dataset '${datasetId}' not found in registry.`);
    }

    const run = await this.harness.executeRun(dataset, options?.executors);
    this.repository.saveRun(run);
    return run;
  }

  /**
   * Generate an evaluation report, optionally comparing against a baseline run.
   */
  public generateReport(runId: string, baselineRunId?: string): EvaluationReport {
    const run = this.repository.findRunById(runId);
    if (!run) {
      throw new Error(`Evaluation run '${runId}' not found.`);
    }

    let regression = undefined;
    if (baselineRunId) {
      const baseline = this.repository.findRunById(baselineRunId);
      if (baseline) {
        regression = RegressionEngine.compare(baseline, run);
      }
    }

    return EvaluationReportSchema.parse({
      reportId: `eval_rep_${randomUUID().slice(0, 8)}`,
      runId,
      generatedAt: new Date().toISOString(),
      run,
      regression,
    });
  }
}
