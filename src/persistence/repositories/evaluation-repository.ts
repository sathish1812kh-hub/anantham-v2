import {
  type EvaluationRun,
  type EvaluationCaseResult,
  EvaluationRunSchema,
  EvaluationCaseResultSchema,
} from "../../domain/evaluation.js";
import type { SqliteEngine } from "../sqlite-engine.js";

interface EvalRunRow {
  id: string;
  dataset_id: string;
  dataset_version: string;
  status: string;
  summary_json: string;
  provenance_json: string;
  created_at: string;
  completed_at: string | null;
}

interface EvalCaseResultRow {
  id: string;
  run_id: string;
  case_id: string;
  status: string;
  score: number;
  assertion_results_json: string;
  evidence_json: string;
  failure_classification: string;
  duration_ms: number;
  started_at: string;
  completed_at: string;
}

export class EvaluationRepository {
  private readonly engine: SqliteEngine;

  constructor(engine: SqliteEngine) {
    this.engine = engine;
  }

  public saveRun(run: EvaluationRun): void {
    const validated = EvaluationRunSchema.parse(run);

    this.engine.transaction(() => {
      const stmt = this.engine.raw.prepare(`
        INSERT INTO eval_runs (
          id, dataset_id, dataset_version, status, summary_json,
          provenance_json, created_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          summary_json = excluded.summary_json,
          completed_at = excluded.completed_at;
      `);

      stmt.run(
        validated.id,
        validated.datasetId,
        validated.datasetVersion,
        validated.status,
        JSON.stringify(validated.summary),
        JSON.stringify(validated.provenance),
        validated.createdAt,
        validated.completedAt ?? null
      );

      for (const res of validated.results) {
        this.saveCaseResult(validated.id, res);
      }
    });
  }

  public saveCaseResult(runId: string, result: EvaluationCaseResult): void {
    const validated = EvaluationCaseResultSchema.parse(result);
    const id = `${runId}_${validated.caseId}`;

    const stmt = this.engine.raw.prepare(`
      INSERT INTO eval_case_results (
        id, run_id, case_id, status, score,
        assertion_results_json, evidence_json, failure_classification,
        duration_ms, started_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        score = excluded.score,
        assertion_results_json = excluded.assertion_results_json,
        evidence_json = excluded.evidence_json,
        failure_classification = excluded.failure_classification,
        duration_ms = excluded.duration_ms,
        completed_at = excluded.completed_at;
    `);

    stmt.run(
      id,
      runId,
      validated.caseId,
      validated.status,
      validated.score,
      JSON.stringify(validated.assertionResults),
      JSON.stringify(validated.evidence),
      validated.failureClassification,
      validated.durationMs,
      validated.startedAt,
      validated.completedAt
    );
  }

  public findRunById(id: string): EvaluationRun | null {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM eval_runs WHERE id = ?;
    `);
    const row = stmt.get(id) as EvalRunRow | undefined;
    if (!row) return null;

    const caseResults = this.listCaseResultsByRun(id);

    return EvaluationRunSchema.parse({
      id: row.id,
      datasetId: row.dataset_id,
      datasetVersion: row.dataset_version,
      status: row.status,
      summary: JSON.parse(row.summary_json),
      provenance: JSON.parse(row.provenance_json),
      results: caseResults,
      createdAt: row.created_at,
      completedAt: row.completed_at ?? undefined,
    });
  }

  public listCaseResultsByRun(runId: string): EvaluationCaseResult[] {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM eval_case_results WHERE run_id = ? ORDER BY started_at ASC;
    `);
    const rows = stmt.all(runId) as unknown as EvalCaseResultRow[];
    return rows.map((r) =>
      EvaluationCaseResultSchema.parse({
        caseId: r.case_id,
        status: r.status,
        score: r.score,
        assertionResults: JSON.parse(r.assertion_results_json),
        evidence: JSON.parse(r.evidence_json),
        failureClassification: r.failure_classification,
        durationMs: r.duration_ms,
        startedAt: r.started_at,
        completedAt: r.completed_at,
      })
    );
  }

  public listRuns(datasetId?: string): EvaluationRun[] {
    let sql = "SELECT * FROM eval_runs";
    const params: string[] = [];
    if (datasetId) {
      sql += " WHERE dataset_id = ?";
      params.push(datasetId);
    }
    sql += " ORDER BY created_at DESC;";

    const stmt = this.engine.raw.prepare(sql);
    const rows = stmt.all(...params) as unknown as EvalRunRow[];

    return rows.map((r) => {
      const caseResults = this.listCaseResultsByRun(r.id);
      return EvaluationRunSchema.parse({
        id: r.id,
        datasetId: r.dataset_id,
        datasetVersion: r.dataset_version,
        status: r.status,
        summary: JSON.parse(r.summary_json),
        provenance: JSON.parse(r.provenance_json),
        results: caseResults,
        createdAt: r.created_at,
        completedAt: r.completed_at ?? undefined,
      });
    });
  }
}
