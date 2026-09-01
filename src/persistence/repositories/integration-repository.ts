import {
  type IntegrationDefinition,
  IntegrationDefinitionSchema,
} from "../../domain/integration.js";
import type { SqliteEngine } from "../sqlite-engine.js";

interface IntegrationRow {
  id: string;
  project_id: string;
  name: string;
  type: string;
  status: string;
  config_json: string;
  secret_ref: string | null;
  created_at: string;
  updated_at: string;
  metadata_json: string;
}

export class IntegrationRepository {
  private readonly engine: SqliteEngine;

  constructor(engine: SqliteEngine) {
    this.engine = engine;
  }

  private rowToIntegration(row: IntegrationRow): IntegrationDefinition {
    return IntegrationDefinitionSchema.parse({
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      type: row.type,
      status: row.status,
      config: JSON.parse(row.config_json),
      secretRef: row.secret_ref ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: JSON.parse(row.metadata_json),
    });
  }

  public save(integration: IntegrationDefinition): void {
    const validated = IntegrationDefinitionSchema.parse(integration);
    const stmt = this.engine.raw.prepare(`
      INSERT INTO integrations (
        id, project_id, name, type, status, config_json, secret_ref, created_at, updated_at, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        type = excluded.type,
        status = excluded.status,
        config_json = excluded.config_json,
        secret_ref = excluded.secret_ref,
        updated_at = excluded.updated_at,
        metadata_json = excluded.metadata_json;
    `);

    stmt.run(
      validated.id,
      validated.projectId,
      validated.name,
      validated.type,
      validated.status,
      JSON.stringify(validated.config),
      validated.secretRef ?? null,
      validated.createdAt,
      validated.updatedAt,
      JSON.stringify(validated.metadata ?? {})
    );
  }

  public findById(id: string): IntegrationDefinition | null {
    const stmt = this.engine.raw.prepare("SELECT * FROM integrations WHERE id = ?");
    const row = stmt.get(id) as IntegrationRow | undefined;
    return row ? this.rowToIntegration(row) : null;
  }

  public listByProject(projectId: string): IntegrationDefinition[] {
    const stmt = this.engine.raw.prepare(
      "SELECT * FROM integrations WHERE project_id = ? ORDER BY created_at DESC"
    );
    const rows = stmt.all(projectId) as unknown as IntegrationRow[];
    return rows.map((r) => this.rowToIntegration(r));
  }

  public listAll(): IntegrationDefinition[] {
    const stmt = this.engine.raw.prepare("SELECT * FROM integrations ORDER BY created_at DESC");
    const rows = stmt.all() as unknown as IntegrationRow[];
    return rows.map((r) => this.rowToIntegration(r));
  }

  public delete(id: string): boolean {
    const stmt = this.engine.raw.prepare("DELETE FROM integrations WHERE id = ?");
    const res = stmt.run(id);
    return res.changes > 0;
  }
}
