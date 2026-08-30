import {
  MemoryItemSchema,
  type MemoryItem,
  type MemoryScope,
} from "../../domain/memory.js";
import type { SqliteEngine } from "../sqlite-engine.js";

interface MemoryRow {
  id: string;
  scope: string;
  project_id: string | null;
  session_id: string | null;
  agent_id: string | null;
  type: string;
  content: string;
  confidence: number;
  priority: string;
  source_event_ids_json: string;
  source_artifacts_json: string | null;
  created_at: string;
  last_validated_at: string | null;
  expires_at: string | null;
  sensitivity: string;
  tags_json: string | null;
  metadata_json: string | null;
}

export class MemoryRepository {
  private readonly engine: SqliteEngine;

  constructor(engine: SqliteEngine) {
    this.engine = engine;
  }

  private rowToMemoryItem(row: MemoryRow): MemoryItem {
    const rawObj = {
      id: row.id,
      scope: row.scope,
      projectId: row.project_id ?? undefined,
      sessionId: row.session_id ?? undefined,
      agentId: row.agent_id ?? undefined,
      type: row.type,
      content: row.content,
      confidence: row.confidence,
      priority: row.priority,
      sourceEventIds: JSON.parse(row.source_event_ids_json),
      sourceArtifacts: row.source_artifacts_json ? JSON.parse(row.source_artifacts_json) : undefined,
      createdAt: row.created_at,
      lastValidatedAt: row.last_validated_at ?? undefined,
      expiresAt: row.expires_at ?? undefined,
      sensitivity: row.sensitivity,
      tags: row.tags_json ? JSON.parse(row.tags_json) : undefined,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
    };
    return MemoryItemSchema.parse(rawObj);
  }

  public save(item: MemoryItem): void {
    const validated = MemoryItemSchema.parse(item);

    const stmt = this.engine.raw.prepare(`
      INSERT INTO memory_items (
        id, scope, project_id, session_id, agent_id,
        type, content, confidence, priority, source_event_ids_json,
        source_artifacts_json, created_at, last_validated_at,
        expires_at, sensitivity, tags_json, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        scope = excluded.scope,
        type = excluded.type,
        content = excluded.content,
        confidence = excluded.confidence,
        priority = excluded.priority,
        source_event_ids_json = excluded.source_event_ids_json,
        source_artifacts_json = excluded.source_artifacts_json,
        last_validated_at = excluded.last_validated_at,
        expires_at = excluded.expires_at,
        sensitivity = excluded.sensitivity,
        tags_json = excluded.tags_json,
        metadata_json = excluded.metadata_json;
    `);

    stmt.run(
      validated.id,
      validated.scope,
      validated.projectId ?? null,
      validated.sessionId ?? null,
      validated.agentId ?? null,
      validated.type,
      validated.content,
      validated.confidence,
      validated.priority,
      JSON.stringify(validated.sourceEventIds),
      validated.sourceArtifacts ? JSON.stringify(validated.sourceArtifacts) : null,
      validated.createdAt,
      validated.lastValidatedAt ?? null,
      validated.expiresAt ?? null,
      validated.sensitivity,
      validated.tags ? JSON.stringify(validated.tags) : null,
      validated.metadata ? JSON.stringify(validated.metadata) : null
    );
  }

  public findById(id: string): MemoryItem | null {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM memory_items WHERE id = ?;
    `);
    const row = stmt.get(id) as MemoryRow | undefined;
    return row ? this.rowToMemoryItem(row) : null;
  }

  public listByScope(
    scope: MemoryScope,
    filter?: { projectId?: string; sessionId?: string }
  ): MemoryItem[] {
    let sql = "SELECT * FROM memory_items WHERE scope = ?";
    const params: (string | number | null)[] = [scope];

    if (filter?.projectId) {
      sql += " AND project_id = ?";
      params.push(filter.projectId);
    }
    if (filter?.sessionId) {
      sql += " AND session_id = ?";
      params.push(filter.sessionId);
    }
    sql += " ORDER BY confidence DESC, created_at DESC;";

    const stmt = this.engine.raw.prepare(sql);
    const rows = stmt.all(...params) as unknown as MemoryRow[];
    return rows.map((r) => this.rowToMemoryItem(r));
  }

  public delete(id: string): boolean {
    const stmt = this.engine.raw.prepare("DELETE FROM memory_items WHERE id = ?;");
    const result = stmt.run(id);
    return Number(result.changes) > 0;
  }
}
