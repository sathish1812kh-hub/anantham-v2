import { ArtifactSchema, type Artifact } from "../../domain/artifact.js";
import type { SqliteEngine } from "../sqlite-engine.js";

interface ArtifactRow {
  id: string;
  type: string;
  project_id: string | null;
  session_id: string | null;
  task_id: string | null;
  agent_id: string | null;
  content_uri: string;
  preview_uri: string | null;
  sha256: string;
  source_event_ids_json: string;
  verification_json: string | null;
  created_at: string;
  metadata_json: string | null;
}

export class ArtifactRepository {
  private readonly engine: SqliteEngine;

  constructor(engine: SqliteEngine) {
    this.engine = engine;
  }

  private rowToArtifact(row: ArtifactRow): Artifact {
    const rawObj = {
      id: row.id,
      type: row.type,
      projectId: row.project_id ?? undefined,
      sessionId: row.session_id ?? undefined,
      taskId: row.task_id ?? undefined,
      agentId: row.agent_id ?? undefined,
      contentUri: row.content_uri,
      previewUri: row.preview_uri ?? undefined,
      sha256: row.sha256,
      sourceEventIds: JSON.parse(row.source_event_ids_json),
      verification: row.verification_json ? JSON.parse(row.verification_json) : undefined,
      createdAt: row.created_at,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
    };
    return ArtifactSchema.parse(rawObj);
  }

  public save(artifact: Artifact): void {
    const validated = ArtifactSchema.parse(artifact);

    const stmt = this.engine.raw.prepare(`
      INSERT INTO artifacts (
        id, type, project_id, session_id, task_id, agent_id,
        content_uri, preview_uri, sha256, source_event_ids_json,
        verification_json, created_at, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        type = excluded.type,
        content_uri = excluded.content_uri,
        preview_uri = excluded.preview_uri,
        sha256 = excluded.sha256,
        source_event_ids_json = excluded.source_event_ids_json,
        verification_json = excluded.verification_json,
        metadata_json = excluded.metadata_json;
    `);

    stmt.run(
      validated.id,
      validated.type,
      validated.projectId ?? null,
      validated.sessionId ?? null,
      validated.taskId ?? null,
      validated.agentId ?? null,
      validated.contentUri,
      validated.previewUri ?? null,
      validated.sha256,
      JSON.stringify(validated.sourceEventIds),
      validated.verification ? JSON.stringify(validated.verification) : null,
      validated.createdAt,
      validated.metadata ? JSON.stringify(validated.metadata) : null
    );
  }

  public findById(id: string): Artifact | null {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM artifacts WHERE id = ?;
    `);
    const row = stmt.get(id) as ArtifactRow | undefined;
    return row ? this.rowToArtifact(row) : null;
  }

  public findByHash(sha256: string): Artifact | null {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM artifacts WHERE sha256 = ? LIMIT 1;
    `);
    const row = stmt.get(sha256) as ArtifactRow | undefined;
    return row ? this.rowToArtifact(row) : null;
  }

  public listByTask(taskId: string): Artifact[] {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM artifacts WHERE task_id = ? ORDER BY created_at ASC;
    `);
    const rows = stmt.all(taskId) as unknown as ArtifactRow[];
    return rows.map((r) => this.rowToArtifact(r));
  }

  public listBySession(sessionId: string): Artifact[] {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM artifacts WHERE session_id = ? ORDER BY created_at ASC;
    `);
    const rows = stmt.all(sessionId) as unknown as ArtifactRow[];
    return rows.map((r) => this.rowToArtifact(r));
  }
}
