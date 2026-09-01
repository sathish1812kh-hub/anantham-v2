import {
  type BackgroundJob,
  type JobStatus,
  type JobFailureClassification,
  BackgroundJobSchema,
} from "../../domain/job.js";
import { SqliteEngine } from "../sqlite-engine.js";

interface BackgroundJobRow {
  id: string;
  project_id: string;
  session_id: string;
  task_id: string;
  workflow_id: string | null;
  run_id: string | null;
  agent_id: string;
  instance_id: string;
  status: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  heartbeat_at: string | null;
  deadline: string | null;
  attempt: number;
  max_attempts: number;
  lease_id: string | null;
  generation: number | null;
  budget_json: string | null;
  consumption_json: string | null;
  cancellation_requested_at: string | null;
  cancellation_reason: string | null;
  failure_classification: string | null;
  error_message: string | null;
  result_artifacts_json: string | null;
  result_data_json: string | null;
  checkpoint_id: string | null;
  metadata_json: string | null;
}

/**
 * SQLite Repository for Background Jobs.
 * PRD Part 2 Section 120–135.
 */
export class JobRepository {
  constructor(private readonly engine: SqliteEngine) {}

  public get sqliteEngine(): SqliteEngine {
    return this.engine;
  }

  public saveJob(job: BackgroundJob): void {

    const validated = BackgroundJobSchema.parse(job);
    const stmt = this.engine.raw.prepare(`
      INSERT INTO background_jobs (
        id, project_id, session_id, task_id, workflow_id, run_id,
        agent_id, instance_id, status, created_at, started_at, completed_at,
        heartbeat_at, deadline, attempt, max_attempts, lease_id, generation,
        budget_json, consumption_json, cancellation_requested_at,
        cancellation_reason, failure_classification, error_message,
        result_artifacts_json, result_data_json, checkpoint_id, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        started_at = excluded.started_at,
        completed_at = excluded.completed_at,
        heartbeat_at = excluded.heartbeat_at,
        deadline = excluded.deadline,
        attempt = excluded.attempt,
        max_attempts = excluded.max_attempts,
        lease_id = excluded.lease_id,
        generation = excluded.generation,
        budget_json = excluded.budget_json,
        consumption_json = excluded.consumption_json,
        cancellation_requested_at = excluded.cancellation_requested_at,
        cancellation_reason = excluded.cancellation_reason,
        failure_classification = excluded.failure_classification,
        error_message = excluded.error_message,
        result_artifacts_json = excluded.result_artifacts_json,
        result_data_json = excluded.result_data_json,
        checkpoint_id = excluded.checkpoint_id,
        metadata_json = excluded.metadata_json;
    `);

    stmt.run(
      validated.id,
      validated.projectId,
      validated.sessionId,
      validated.taskId,
      validated.workflowId ?? null,
      validated.runId ?? null,
      validated.agentId,
      validated.instanceId,
      validated.status,
      validated.createdAt,
      validated.startedAt ?? null,
      validated.completedAt ?? null,
      validated.heartbeatAt ?? null,
      validated.deadline ?? null,
      validated.attempt,
      validated.maxAttempts,
      validated.leaseId ?? null,
      validated.generation ?? null,
      validated.budget ? JSON.stringify(validated.budget) : null,
      JSON.stringify(validated.consumption),
      validated.cancellationRequestedAt ?? null,
      validated.cancellationReason ?? null,
      validated.failureClassification ?? null,
      validated.errorMessage ?? null,
      JSON.stringify(validated.resultArtifacts),
      validated.resultData !== undefined ? JSON.stringify(validated.resultData) : null,
      validated.checkpointId ?? null,
      JSON.stringify(validated.metadata)
    );
  }

  public findJobById(id: string): BackgroundJob | null {
    const stmt = this.engine.raw.prepare(`SELECT * FROM background_jobs WHERE id = ?;`);
    const row = stmt.get(id) as BackgroundJobRow | undefined;
    if (!row) return null;
    return this.mapRow(row);
  }

  public findJobByTaskId(taskId: string): BackgroundJob | null {
    const stmt = this.engine.raw.prepare(`SELECT * FROM background_jobs WHERE task_id = ?;`);
    const row = stmt.get(taskId) as BackgroundJobRow | undefined;
    if (!row) return null;
    return this.mapRow(row);
  }

  public listJobsByProject(projectId: string, limit = 50): BackgroundJob[] {
    const stmt = this.engine.raw.prepare(
      `SELECT * FROM background_jobs WHERE project_id = ? ORDER BY created_at DESC LIMIT ?;`
    );
    const rows = stmt.all(projectId, limit) as unknown as BackgroundJobRow[];
    return rows.map((r) => this.mapRow(r));
  }

  public listJobsByStatus(status: JobStatus, projectId?: string): BackgroundJob[] {
    let sql = `SELECT * FROM background_jobs WHERE status = ?`;
    const params: (string | number)[] = [status];
    if (projectId) {
      sql += ` AND project_id = ?`;
      params.push(projectId);
    }
    sql += ` ORDER BY created_at ASC;`;
    const stmt = this.engine.raw.prepare(sql);
    const rows = stmt.all(...params) as unknown as BackgroundJobRow[];
    return rows.map((r) => this.mapRow(r));
  }

  public listActiveJobs(projectId?: string): BackgroundJob[] {
    const activeStatuses = ["CREATED", "QUEUED", "CLAIMING", "RUNNING", "CANCEL_REQUESTED", "COMPLETING"];
    const placeholders = activeStatuses.map(() => "?").join(", ");
    let sql = `SELECT * FROM background_jobs WHERE status IN (${placeholders})`;
    const params: (string | number)[] = [...activeStatuses];
    if (projectId) {
      sql += ` AND project_id = ?`;
      params.push(projectId);
    }
    sql += ` ORDER BY created_at ASC;`;
    const stmt = this.engine.raw.prepare(sql);
    const rows = stmt.all(...params) as unknown as BackgroundJobRow[];
    return rows.map((r) => this.mapRow(r));
  }

  public listStalledJobs(staleBeforeIso: string): BackgroundJob[] {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM background_jobs 
      WHERE status = 'RUNNING' 
        AND (heartbeat_at IS NULL OR heartbeat_at < ?)
      ORDER BY created_at ASC;
    `);
    const rows = stmt.all(staleBeforeIso) as unknown as BackgroundJobRow[];
    return rows.map((r) => this.mapRow(r));
  }

  public deleteJob(id: string): void {
    const stmt = this.engine.raw.prepare(`DELETE FROM background_jobs WHERE id = ?;`);
    stmt.run(id);
  }

  private mapRow(row: BackgroundJobRow): BackgroundJob {
    return BackgroundJobSchema.parse({
      id: row.id,
      projectId: row.project_id,
      sessionId: row.session_id,
      taskId: row.task_id,
      workflowId: row.workflow_id ?? undefined,
      runId: row.run_id ?? undefined,
      agentId: row.agent_id,
      instanceId: row.instance_id,
      status: row.status as JobStatus,
      createdAt: row.created_at,
      startedAt: row.started_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
      heartbeatAt: row.heartbeat_at ?? undefined,
      deadline: row.deadline ?? undefined,
      attempt: row.attempt,
      maxAttempts: row.max_attempts,
      leaseId: row.lease_id ?? undefined,
      generation: row.generation ?? undefined,
      budget: row.budget_json ? JSON.parse(row.budget_json) : undefined,
      consumption: row.consumption_json
        ? JSON.parse(row.consumption_json)
        : { tokens: 0, costUsd: 0, durationMs: 0, toolCalls: 0 },
      cancellationRequestedAt: row.cancellation_requested_at ?? undefined,
      cancellationReason: row.cancellation_reason ?? undefined,
      failureClassification: (row.failure_classification as JobFailureClassification) ?? undefined,
      errorMessage: row.error_message ?? undefined,
      resultArtifacts: row.result_artifacts_json ? JSON.parse(row.result_artifacts_json) : [],
      resultData: row.result_data_json ? JSON.parse(row.result_data_json) : undefined,
      checkpointId: row.checkpoint_id ?? undefined,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : {},
    });
  }
}
