import { ProjectSchema, type Project, type ProjectStatus } from "../../domain/project.js";
import type { SqliteEngine } from "../sqlite-engine.js";

interface ProjectRow {
  id: string;
  name: string;
  root_path: string;
  status: string;
  tags_json: string;
  model_profile: string;
  memory_namespace: string;
  orchestration_profile: string;
  trust_profile: string;
  created_at: string;
  last_opened_at: string;
  last_activity_at: string;
  metadata_json: string | null;
}

export class ProjectRepository {
  private readonly engine: SqliteEngine;

  constructor(engine: SqliteEngine) {
    this.engine = engine;
  }

  private rowToProject(row: ProjectRow): Project {
    const rawObj = {
      id: row.id,
      name: row.name,
      rootPath: row.root_path,
      status: row.status,
      tags: JSON.parse(row.tags_json),
      modelProfile: row.model_profile,
      memoryNamespace: row.memory_namespace,
      orchestrationProfile: row.orchestration_profile,
      trustProfile: row.trust_profile,
      createdAt: row.created_at,
      lastOpenedAt: row.last_opened_at,
      lastActivityAt: row.last_activity_at,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
    };
    return ProjectSchema.parse(rawObj);
  }

  public save(project: Project): void {
    const validated = ProjectSchema.parse(project);
    const stmt = this.engine.raw.prepare(`
      INSERT INTO projects (
        id, name, root_path, status, tags_json, model_profile,
        memory_namespace, orchestration_profile, trust_profile,
        created_at, last_opened_at, last_activity_at, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        root_path = excluded.root_path,
        status = excluded.status,
        tags_json = excluded.tags_json,
        model_profile = excluded.model_profile,
        memory_namespace = excluded.memory_namespace,
        orchestration_profile = excluded.orchestration_profile,
        trust_profile = excluded.trust_profile,
        last_opened_at = excluded.last_opened_at,
        last_activity_at = excluded.last_activity_at,
        metadata_json = excluded.metadata_json;
    `);

    stmt.run(
      validated.id,
      validated.name,
      validated.rootPath,
      validated.status,
      JSON.stringify(validated.tags),
      validated.modelProfile,
      validated.memoryNamespace,
      validated.orchestrationProfile,
      validated.trustProfile,
      validated.createdAt,
      validated.lastOpenedAt,
      validated.lastActivityAt,
      validated.metadata ? JSON.stringify(validated.metadata) : null
    );
  }

  public findById(id: string): Project | null {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM projects WHERE id = ?;
    `);
    const row = stmt.get(id) as ProjectRow | undefined;
    return row ? this.rowToProject(row) : null;
  }

  public list(filter?: { status?: ProjectStatus }): Project[] {
    let sql = "SELECT * FROM projects";
    const params: (string | number | null)[] = [];

    if (filter?.status) {
      sql += " WHERE status = ?";
      params.push(filter.status);
    }
    sql += " ORDER BY last_activity_at DESC;";

    const stmt = this.engine.raw.prepare(sql);
    const rows = stmt.all(...params) as unknown as ProjectRow[];
    return rows.map((r) => this.rowToProject(r));
  }

  public delete(id: string): boolean {
    const stmt = this.engine.raw.prepare("DELETE FROM projects WHERE id = ?;");
    const result = stmt.run(id);
    return Number(result.changes) > 0;
  }
}
