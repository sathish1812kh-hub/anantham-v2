import {
  TaskSchema,
  assertValidTaskTransition,
  type Task,
  type TaskStatus,
} from "../../domain/task.js";
import type { SqliteEngine } from "../sqlite-engine.js";

interface TaskRow {
  id: string;
  project_id: string;
  session_id: string;
  parent_id: string | null;
  objective: string;
  status: string;
  priority: string;
  agent_role: string | null;
  model_profile: string | null;
  key_pool_profile: string | null;
  permission_profile: string | null;
  dependencies_json: string;
  input_artifacts_json: string;
  output_artifacts_json: string;
  checkpoint_id: string | null;
  read_set_json: string | null;
  write_set_json: string | null;
  created_at: string;
  updated_at: string;
  metadata_json: string | null;
}

export class TaskRepository {
  private readonly engine: SqliteEngine;

  constructor(engine: SqliteEngine) {
    this.engine = engine;
  }

  private rowToTask(row: TaskRow): Task {
    const rawObj = {
      id: row.id,
      projectId: row.project_id,
      sessionId: row.session_id,
      parentId: row.parent_id ?? undefined,
      objective: row.objective,
      status: row.status,
      priority: row.priority,
      agentRole: row.agent_role ?? undefined,
      modelProfile: row.model_profile ?? undefined,
      keyPoolProfile: row.key_pool_profile ?? undefined,
      permissionProfile: row.permission_profile ?? undefined,
      dependencies: JSON.parse(row.dependencies_json),
      inputArtifacts: JSON.parse(row.input_artifacts_json),
      outputArtifacts: JSON.parse(row.output_artifacts_json),
      checkpointId: row.checkpoint_id ?? undefined,
      readSet: row.read_set_json ? JSON.parse(row.read_set_json) : undefined,
      writeSet: row.write_set_json ? JSON.parse(row.write_set_json) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
    };
    return TaskSchema.parse(rawObj);
  }

  public save(task: Task): void {
    const validated = TaskSchema.parse(task);

    // If task already exists, verify valid state transition
    const existing = this.findById(validated.id);
    if (existing && existing.status !== validated.status) {
      assertValidTaskTransition(existing.status, validated.status);
    }

    const stmt = this.engine.raw.prepare(`
      INSERT INTO tasks (
        id, project_id, session_id, parent_id, objective, status, priority,
        agent_role, model_profile, key_pool_profile, permission_profile,
        dependencies_json, input_artifacts_json, output_artifacts_json,
        checkpoint_id, read_set_json, write_set_json,
        created_at, updated_at, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        objective = excluded.objective,
        status = excluded.status,
        priority = excluded.priority,
        agent_role = excluded.agent_role,
        model_profile = excluded.model_profile,
        key_pool_profile = excluded.key_pool_profile,
        permission_profile = excluded.permission_profile,
        dependencies_json = excluded.dependencies_json,
        input_artifacts_json = excluded.input_artifacts_json,
        output_artifacts_json = excluded.output_artifacts_json,
        checkpoint_id = excluded.checkpoint_id,
        read_set_json = excluded.read_set_json,
        write_set_json = excluded.write_set_json,
        updated_at = excluded.updated_at,
        metadata_json = excluded.metadata_json;
    `);

    stmt.run(
      validated.id,
      validated.projectId,
      validated.sessionId,
      validated.parentId ?? null,
      validated.objective,
      validated.status,
      validated.priority,
      validated.agentRole ?? null,
      validated.modelProfile ?? null,
      validated.keyPoolProfile ?? null,
      validated.permissionProfile ?? null,
      JSON.stringify(validated.dependencies),
      JSON.stringify(validated.inputArtifacts),
      JSON.stringify(validated.outputArtifacts),
      validated.checkpointId ?? null,
      validated.readSet ? JSON.stringify(validated.readSet) : null,
      validated.writeSet ? JSON.stringify(validated.writeSet) : null,
      validated.createdAt,
      validated.updatedAt,
      validated.metadata ? JSON.stringify(validated.metadata) : null
    );
  }

  public findById(id: string): Task | null {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM tasks WHERE id = ?;
    `);
    const row = stmt.get(id) as TaskRow | undefined;
    return row ? this.rowToTask(row) : null;
  }

  public listBySession(sessionId: string, filter?: { status?: TaskStatus }): Task[] {
    let sql = "SELECT * FROM tasks WHERE session_id = ?";
    const params: (string | number | null)[] = [sessionId];

    if (filter?.status) {
      sql += " AND status = ?";
      params.push(filter.status);
    }
    sql += " ORDER BY created_at ASC;";

    const stmt = this.engine.raw.prepare(sql);
    const rows = stmt.all(...params) as unknown as TaskRow[];
    return rows.map((r) => this.rowToTask(r));
  }

  public updateStatus(id: string, newStatus: TaskStatus): void {
    const task = this.findById(id);
    if (!task) {
      throw new Error(`Task with id '${id}' not found.`);
    }

    assertValidTaskTransition(task.status, newStatus);

    const stmt = this.engine.raw.prepare(`
      UPDATE tasks
      SET status = ?, updated_at = ?
      WHERE id = ?;
    `);
    stmt.run(newStatus, new Date().toISOString(), id);
  }
}
