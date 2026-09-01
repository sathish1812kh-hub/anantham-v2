import { randomUUID } from "node:crypto";
import { type SqliteEngine } from "../persistence/sqlite-engine.js";
import { type EventStore } from "../event-state/event-store.js";
import { ProjectRepository } from "../persistence/repositories/project-repository.js";
import { SessionRepository } from "../persistence/repositories/session-repository.js";
import {
  type BenchmarkDataset,
  type BenchmarkCase,
  type EvaluationRun,
  type EvaluationCaseResult,
  EvaluationRunSchema,
  EvaluationCaseResultSchema,
} from "../domain/evaluation.js";
import { EvidenceCollector } from "./evidence-collector.js";
import { AssertionEvaluator } from "./assertion-evaluator.js";

export type BenchmarkCaseExecutor = (
  benchCase: BenchmarkCase,
  context: {
    projectId: string;
    sessionId: string;
    evidenceCollector: EvidenceCollector;
    engine: SqliteEngine;
    eventStore: EventStore;
  }
) => Promise<void> | void;

export interface EvaluationHarnessOptions {
  engine: SqliteEngine;
  eventStore: EventStore;
  gitCommit?: string;
  runtimeVersion?: string;
}

/**
 * Evaluation Harness.
 * PRD Part 3 Section 92.
 */
export class EvaluationHarness {
  private readonly engine: SqliteEngine;
  private readonly eventStore: EventStore;
  private readonly projectRepo: ProjectRepository;
  private readonly sessionRepo: SessionRepository;
  private readonly gitCommit: string;
  private readonly runtimeVersion: string;

  constructor(options: EvaluationHarnessOptions) {
    this.engine = options.engine;
    this.eventStore = options.eventStore;
    this.projectRepo = new ProjectRepository(options.engine);
    this.sessionRepo = new SessionRepository(options.engine);
    this.gitCommit = options.gitCommit ?? "de6bf08";
    this.runtimeVersion = options.runtimeVersion ?? "2.0.0-alpha.1";
  }

  /**
   * Execute an evaluation run over a benchmark dataset.
   */
  public async executeRun(
    dataset: BenchmarkDataset,
    executors?: Record<string, BenchmarkCaseExecutor>
  ): Promise<EvaluationRun> {
    const runId = `eval_run_${randomUUID().slice(0, 8)}`;
    const startedAt = new Date().toISOString();
    const caseResults: EvaluationCaseResult[] = [];

    // Create isolated project & session for the evaluation run
    const evalProjectId = `eval_proj_${runId}`;
    const evalSessionId = `eval_sess_${runId}`;

    this.projectRepo.save({
      id: evalProjectId,
      name: `Evaluation Project (${runId})`,
      rootPath: `/tmp/eval/${runId}`,
      status: "active",
      tags: ["evaluation"],
      modelProfile: "default",
      memoryNamespace: "eval",
      orchestrationProfile: "default",
      trustProfile: "safe",
      createdAt: startedAt,
      lastOpenedAt: startedAt,
      lastActivityAt: startedAt,
      metadata: { runId },
    });

    this.sessionRepo.save({
      id: evalSessionId,
      projectId: evalProjectId,
      name: `Evaluation Session (${runId})`,
      branch: "main",
      status: "active",
      modelProfile: "default",
      keyPoolProfile: "default",
      mode: "interactive",
      permissions: {},
      createdAt: startedAt,
      updatedAt: startedAt,
      metadata: { runId },
    });

    try {
      for (const benchCase of dataset.cases) {
        const result = await this.executeCase(benchCase, {
          projectId: evalProjectId,
          sessionId: evalSessionId,
          executor: executors?.[benchCase.caseId],
        });
        caseResults.push(result);
      }
    } finally {
      // Mark evaluation session and project completed
      try {
        this.sessionRepo.updateStatus(evalSessionId, "archived");
        this.projectRepo.updateStatus(evalProjectId, "archived");
      } catch {
        // Ignore archive error in cleanup
      }
    }

    const completedAt = new Date().toISOString();
    const passedCases = caseResults.filter((r) => r.status === "PASS").length;
    const failedCases = caseResults.filter((r) => r.status === "FAIL").length;
    const partialCases = caseResults.filter((r) => r.status === "PARTIAL").length;
    const inconclusiveCases = caseResults.filter((r) => r.status === "INCONCLUSIVE").length;
    const totalCases = caseResults.length;

    const totalScore = caseResults.reduce((acc, r) => acc + r.score, 0);
    const overallScore = totalCases > 0 ? Math.round((totalScore / totalCases) * 100) / 100 : 0;

    return EvaluationRunSchema.parse({
      id: runId,
      datasetId: dataset.datasetId,
      datasetVersion: dataset.version,
      status: failedCases === 0 ? "COMPLETED" : "FAILED",
      summary: {
        totalCases,
        passedCases,
        failedCases,
        partialCases,
        inconclusiveCases,
        overallScore,
      },
      results: caseResults,
      provenance: {
        runtimeVersion: this.runtimeVersion,
        gitCommit: this.gitCommit,
        datasetId: dataset.datasetId,
        datasetVersion: dataset.version,
        modelProfile: "default",
        environment: "node-test",
      },
      createdAt: startedAt,
      completedAt,
    });
  }

  /**
   * Execute an individual benchmark case.
   */
  public async executeCase(
    benchCase: BenchmarkCase,
    options: { projectId: string; sessionId: string; executor?: BenchmarkCaseExecutor }
  ): Promise<EvaluationCaseResult> {
    const caseStart = Date.now();
    const startedAt = new Date().toISOString();
    const evidenceCollector = new EvidenceCollector();

    // Listen to EventStore for this session/project
    const unsubscribe = this.eventStore.subscribe(
      { projectId: options.projectId },
      (event) => {
        evidenceCollector.recordEvent(event);
      }
    );

    let failureClassification: EvaluationCaseResult["failureClassification"] = "NONE";

    try {
      if (options.executor) {
        await options.executor(benchCase, {
          projectId: options.projectId,
          sessionId: options.sessionId,
          evidenceCollector,
          engine: this.engine,
          eventStore: this.eventStore,
        });
      }
    } catch (err: any) {
      const msg = (err.message ?? "").toLowerCase();
      if (msg.includes("timeout")) {
        failureClassification = "TIMEOUT";
      } else if (msg.includes("policy") || msg.includes("denied")) {
        failureClassification = "POLICY";
      } else if (msg.includes("security") || msg.includes("forbidden")) {
        failureClassification = "SECURITY";
      } else {
        failureClassification = "RUNTIME";
      }
    } finally {
      unsubscribe();
    }

    const durationMs = Date.now() - caseStart;
    const completedAt = new Date().toISOString();
    const evidence = evidenceCollector.getEvidence();

    // Evaluate assertions
    const assertionResults = benchCase.assertions.map((a) =>
      AssertionEvaluator.evaluate(a, evidence)
    );

    const criticalFailed = assertionResults.some((r) => r.criticality === "CRITICAL" && !r.passed);
    const optionalFailed = assertionResults.some((r) => r.criticality === "OPTIONAL" && !r.passed);
    const allPassed = assertionResults.every((r) => r.passed);

    let status: EvaluationCaseResult["status"] = "PASS";
    let score = 100;

    if (criticalFailed) {
      status = "FAIL";
      score = 0;
      if (failureClassification === "NONE") {
        failureClassification = "ASSERTION";
      }
    } else if (optionalFailed) {
      status = "PARTIAL";
      const passedCount = assertionResults.filter((r) => r.passed).length;
      score = Math.round((passedCount / assertionResults.length) * 100);
    } else if (!allPassed) {
      status = "INCONCLUSIVE";
      score = 50;
    }

    return EvaluationCaseResultSchema.parse({
      caseId: benchCase.caseId,
      status,
      score,
      assertionResults,
      evidence: {
        eventsCount: evidence.events.length,
        policyDecisions: evidence.policyDecisions,
        stateKeys: Object.keys(evidence.stateSnapshots),
      },
      failureClassification,
      durationMs,
      startedAt,
      completedAt,
    });
  }
}
