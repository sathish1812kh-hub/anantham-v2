import type { SqliteEngine } from "../sqlite-engine.js";
import {
  type WorkflowDefinition,
  WorkflowDefinitionSchema,
  type WorkflowRun,
  WorkflowRunSchema,
  type WorkflowScope,
  type WorkflowStatus,
  type WorkflowRunStatus,
} from "../../domain/workflow.js";

interface WorkflowRow {
  id: string;
  project_id: string | null;
  name: string;
  version: string;
  scope: string;
  status: string;
  description: string | null;
  concurrency_json: string;
  tasks_json: string;
  verify_json: string | null;
  budget_json: string | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

interface WorkflowRunRow {
  id: string;
  workflow_id: string;
  project_id: string | null;
  session_id: string;
  status: string;
  current_step_index: number;
  completed_tasks_json: string;
  failed_tasks_json: string;
  running_tasks_json: string;
  task_results_json: string;
  pinned_versions_json: string;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
}

export class WorkflowRepository {
  constructor(private readonly engine: SqliteEngine) {}

  public saveWorkflow(workflow: WorkflowDefinition): void {
    const validated = WorkflowDefinitionSchema.parse(workflow);
    const stmt = this.engine.raw.prepare(`
      INSERT INTO workflows (
        id, project_id, name, version, scope, status, description,
        concurrency_json, tasks_json, verify_json, budget_json, metadata_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        version = excluded.version,
        scope = excluded.scope,
        status = excluded.status,
        description = excluded.description,
        concurrency_json = excluded.concurrency_json,
        tasks_json = excluded.tasks_json,
        verify_json = excluded.verify_json,
        budget_json = excluded.budget_json,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at;
    `);

    stmt.run(
      validated.id,
      validated.projectId ?? null,
      validated.name,
      validated.version,
      validated.scope,
      validated.status,
      validated.description ?? null,
      JSON.stringify(validated.concurrency),
      JSON.stringify(validated.tasks),
      JSON.stringify(validated.verify),
      validated.budget ? JSON.stringify(validated.budget) : null,
      JSON.stringify(validated.metadata),
      validated.createdAt,
      validated.updatedAt
    );
  }

  public findWorkflowById(id: string): WorkflowDefinition | null {
    const stmt = this.engine.raw.prepare(`SELECT * FROM workflows WHERE id = ?;`);
    const row = stmt.get(id) as WorkflowRow | undefined;
    if (!row) return null;
    return this.mapWorkflowRow(row);
  }

  public findWorkflowByNameAndVersion(
    name: string,
    version: string,
    projectId?: string
  ): WorkflowDefinition | null {
    if (projectId) {
      const stmt = this.engine.raw.prepare(`
        SELECT * FROM workflows
        WHERE name = ? AND version = ? AND (project_id = ? OR scope IN ('global', 'built-in'))
        ORDER BY CASE scope
          WHEN 'project' THEN 1
          WHEN 'profile' THEN 2
          WHEN 'global' THEN 3
          WHEN 'built-in' THEN 4
          ELSE 5 END ASC
        LIMIT 1;
      `);
      const row = stmt.get(name, version, projectId) as WorkflowRow | undefined;
      return row ? this.mapWorkflowRow(row) : null;
    }

    const stmt = this.engine.raw.prepare(`
      SELECT * FROM workflows WHERE name = ? AND version = ? LIMIT 1;
    `);
    const row = stmt.get(name, version) as WorkflowRow | undefined;
    return row ? this.mapWorkflowRow(row) : null;
  }

  public listWorkflows(projectId?: string): WorkflowDefinition[] {
    if (projectId) {
      const stmt = this.engine.raw.prepare(`
        SELECT * FROM workflows
        WHERE project_id = ? OR scope IN ('global', 'built-in')
        ORDER BY created_at DESC;
      `);
      const rows = stmt.all(projectId) as unknown as WorkflowRow[];
      return rows.map((r) => this.mapWorkflowRow(r));
    }

    const stmt = this.engine.raw.prepare(`SELECT * FROM workflows ORDER BY created_at DESC;`);
    const rows = stmt.all() as unknown as WorkflowRow[];
    return rows.map((r) => this.mapWorkflowRow(r));
  }

  public listWorkflowsByScope(scope: WorkflowScope, projectId?: string): WorkflowDefinition[] {
    if (projectId) {
      const stmt = this.engine.raw.prepare(`
        SELECT * FROM workflows WHERE scope = ? AND (project_id = ? OR project_id IS NULL)
        ORDER BY created_at DESC;
      `);
      const rows = stmt.all(scope, projectId) as unknown as WorkflowRow[];
      return rows.map((r) => this.mapWorkflowRow(r));
    }

    const stmt = this.engine.raw.prepare(`
      SELECT * FROM workflows WHERE scope = ? ORDER BY created_at DESC;
    `);
    const rows = stmt.all(scope) as unknown as WorkflowRow[];
    return rows.map((r) => this.mapWorkflowRow(r));
  }

  public updateWorkflowStatus(id: string, status: WorkflowStatus): void {
    const stmt = this.engine.raw.prepare(`
      UPDATE workflows SET status = ?, updated_at = ? WHERE id = ?;
    `);
    stmt.run(status, new Date().toISOString(), id);
  }

  public deleteWorkflow(id: string): boolean {
    const stmt = this.engine.raw.prepare(`DELETE FROM workflows WHERE id = ?;`);
    const res = stmt.run(id);
    return res.changes > 0;
  }

  // Workflow Runs Persistence
  public saveWorkflowRun(run: WorkflowRun): void {
    const validated = WorkflowRunSchema.parse(run);
    const stmt = this.engine.raw.prepare(`
      INSERT INTO workflow_runs (
        id, workflow_id, project_id, session_id, status, current_step_index,
        completed_tasks_json, failed_tasks_json, running_tasks_json, task_results_json,
        pinned_versions_json, started_at, completed_at, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        current_step_index = excluded.current_step_index,
        completed_tasks_json = excluded.completed_tasks_json,
        failed_tasks_json = excluded.failed_tasks_json,
        running_tasks_json = excluded.running_tasks_json,
        task_results_json = excluded.task_results_json,
        pinned_versions_json = excluded.pinned_versions_json,
        completed_at = excluded.completed_at,
        error_message = excluded.error_message;
    `);

    stmt.run(
      validated.id,
      validated.workflowId,
      validated.projectId ?? null,
      validated.sessionId,
      validated.status,
      validated.currentStepIndex,
      JSON.stringify(validated.completedTasks),
      JSON.stringify(validated.failedTasks),
      JSON.stringify(validated.runningTasks),
      JSON.stringify(validated.taskResults),
      JSON.stringify(validated.pinnedVersions),
      validated.startedAt,
      validated.completedAt ?? null,
      validated.errorMessage ?? null
    );
  }

  public findWorkflowRunById(id: string): WorkflowRun | null {
    const stmt = this.engine.raw.prepare(`SELECT * FROM workflow_runs WHERE id = ?;`);
    const row = stmt.get(id) as WorkflowRunRow | undefined;
    if (!row) return null;
    return this.mapWorkflowRunRow(row);
  }

  public listWorkflowRunsBySession(sessionId: string): WorkflowRun[] {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM workflow_runs WHERE session_id = ? ORDER BY started_at DESC;
    `);
    const rows = stmt.all(sessionId) as unknown as WorkflowRunRow[];
    return rows.map((r) => this.mapWorkflowRunRow(r));
  }

  public listActiveWorkflowRuns(projectId?: string): WorkflowRun[] {
    if (projectId) {
      const stmt = this.engine.raw.prepare(`
        SELECT * FROM workflow_runs
        WHERE status IN ('RUNNING', 'WAITING_APPROVAL', 'QUEUED') AND (project_id = ? OR project_id IS NULL)
        ORDER BY started_at ASC;
      `);
      const rows = stmt.all(projectId) as unknown as WorkflowRunRow[];
      return rows.map((r) => this.mapWorkflowRunRow(r));
    }

    const stmt = this.engine.raw.prepare(`
      SELECT * FROM workflow_runs
      WHERE status IN ('RUNNING', 'WAITING_APPROVAL', 'QUEUED')
      ORDER BY started_at ASC;
    `);
    const rows = stmt.all() as unknown as WorkflowRunRow[];
    return rows.map((r) => this.mapWorkflowRunRow(r));
  }

  public updateWorkflowRunStatus(
    id: string,
    status: WorkflowRunStatus,
    errorMessage?: string
  ): void {
    const isTerminal = status === "COMPLETED" || status === "FAILED" || status === "CANCELLED";
    const completedAt = isTerminal ? new Date().toISOString() : null;

    const stmt = this.engine.raw.prepare(`
      UPDATE workflow_runs
      SET status = ?, completed_at = COALESCE(?, completed_at), error_message = COALESCE(?, error_message)
      WHERE id = ?;
    `);
    stmt.run(status, completedAt, errorMessage ?? null, id);
  }

  private mapWorkflowRow(row: WorkflowRow): WorkflowDefinition {
    return WorkflowDefinitionSchema.parse({
      id: row.id,
      projectId: row.project_id ?? undefined,
      name: row.name,
      version: row.version,
      scope: row.scope as WorkflowScope,
      status: row.status as WorkflowStatus,
      description: row.description ?? undefined,
      concurrency: JSON.parse(row.concurrency_json),
      tasks: JSON.parse(row.tasks_json),
      verify: row.verify_json ? JSON.parse(row.verify_json) : [],
      budget: row.budget_json ? JSON.parse(row.budget_json) : undefined,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  private mapWorkflowRunRow(row: WorkflowRunRow): WorkflowRun {
    return WorkflowRunSchema.parse({
      id: row.id,
      workflowId: row.workflow_id,
      projectId: row.project_id ?? undefined,
      sessionId: row.session_id,
      status: row.status as WorkflowRunStatus,
      currentStepIndex: row.current_step_index,
      completedTasks: JSON.parse(row.completed_tasks_json),
      failedTasks: JSON.parse(row.failed_tasks_json),
      runningTasks: JSON.parse(row.running_tasks_json),
      taskResults: JSON.parse(row.task_results_json),
      pinnedVersions: JSON.parse(row.pinned_versions_json),
      startedAt: row.started_at,
      completedAt: row.completed_at ?? undefined,
      errorMessage: row.error_message ?? undefined,
    });
  }
}
