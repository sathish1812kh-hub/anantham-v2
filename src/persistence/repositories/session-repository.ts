import { SessionSchema, type Session, type SessionStatus } from "../../domain/session.js";
import type { SqliteEngine } from "../sqlite-engine.js";

interface SessionRow {
  id: string;
  project_id: string;
  name: string;
  branch: string;
  current_task_id: string | null;
  parent_session_id: string | null;
  status: string;
  model_profile: string;
  key_pool_profile: string;
  mode: string;
  permissions_json: string;
  created_at: string;
  updated_at: string;
  metadata_json: string | null;
}

export class SessionRepository {
  private readonly engine: SqliteEngine;

  constructor(engine: SqliteEngine) {
    this.engine = engine;
  }

  private rowToSession(row: SessionRow): Session {
    const rawObj = {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      branch: row.branch,
      currentTaskId: row.current_task_id ?? undefined,
      parentSessionId: row.parent_session_id ?? undefined,
      status: row.status,
      modelProfile: row.model_profile,
      keyPoolProfile: row.key_pool_profile,
      mode: row.mode,
      permissions: JSON.parse(row.permissions_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
    };
    return SessionSchema.parse(rawObj);
  }

  public save(session: Session): void {
    const validated = SessionSchema.parse(session);
    const stmt = this.engine.raw.prepare(`
      INSERT INTO sessions (
        id, project_id, name, branch, current_task_id, parent_session_id,
        status, model_profile, key_pool_profile, mode, permissions_json,
        created_at, updated_at, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        branch = excluded.branch,
        current_task_id = excluded.current_task_id,
        parent_session_id = excluded.parent_session_id,
        status = excluded.status,
        model_profile = excluded.model_profile,
        key_pool_profile = excluded.key_pool_profile,
        mode = excluded.mode,
        permissions_json = excluded.permissions_json,
        updated_at = excluded.updated_at,
        metadata_json = excluded.metadata_json;
    `);

    stmt.run(
      validated.id,
      validated.projectId,
      validated.name,
      validated.branch,
      validated.currentTaskId ?? null,
      validated.parentSessionId ?? null,
      validated.status,
      validated.modelProfile,
      validated.keyPoolProfile,
      validated.mode,
      JSON.stringify(validated.permissions),
      validated.createdAt,
      validated.updatedAt,
      validated.metadata ? JSON.stringify(validated.metadata) : null
    );
  }

  public findById(id: string): Session | null {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM sessions WHERE id = ?;
    `);
    const row = stmt.get(id) as SessionRow | undefined;
    return row ? this.rowToSession(row) : null;
  }

  public listByProject(projectId: string, filter?: { status?: SessionStatus }): Session[] {
    let sql = "SELECT * FROM sessions WHERE project_id = ?";
    const params: (string | number | null)[] = [projectId];

    if (filter?.status) {
      sql += " AND status = ?";
      params.push(filter.status);
    }
    sql += " ORDER BY updated_at DESC;";

    const stmt = this.engine.raw.prepare(sql);
    const rows = stmt.all(...params) as unknown as SessionRow[];
    return rows.map((r) => this.rowToSession(r));
  }

  public updateStatus(id: string, status: SessionStatus): void {
    const stmt = this.engine.raw.prepare(`
      UPDATE sessions
      SET status = ?, updated_at = ?
      WHERE id = ?;
    `);
    stmt.run(status, new Date().toISOString(), id);
  }
}
