import { AttachmentSchema, type Attachment } from "../../domain/attachment.js";
import type { SqliteEngine } from "../sqlite-engine.js";

interface AttachmentRow {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  source: string;
  project_id: string | null;
  session_id: string | null;
  task_id: string | null;
  sensitivity: string;
  created_at: string;
  metadata_json: string | null;
}

export class AttachmentRepository {
  private readonly engine: SqliteEngine;

  constructor(engine: SqliteEngine) {
    this.engine = engine;
  }

  private rowToAttachment(row: AttachmentRow): Attachment {
    const rawObj = {
      id: row.id,
      name: row.name,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      sha256: row.sha256,
      source: row.source,
      projectId: row.project_id ?? undefined,
      sessionId: row.session_id ?? undefined,
      taskId: row.task_id ?? undefined,
      sensitivity: row.sensitivity,
      createdAt: row.created_at,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
    };
    return AttachmentSchema.parse(rawObj);
  }

  public save(attachment: Attachment): void {
    const validated = AttachmentSchema.parse(attachment);

    const stmt = this.engine.raw.prepare(`
      INSERT INTO attachments (
        id, name, mime_type, size_bytes, sha256, source,
        project_id, session_id, task_id, sensitivity,
        created_at, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        mime_type = excluded.mime_type,
        size_bytes = excluded.size_bytes,
        sha256 = excluded.sha256,
        source = excluded.source,
        sensitivity = excluded.sensitivity,
        metadata_json = excluded.metadata_json;
    `);

    stmt.run(
      validated.id,
      validated.name,
      validated.mimeType,
      validated.sizeBytes,
      validated.sha256,
      validated.source,
      validated.projectId ?? null,
      validated.sessionId ?? null,
      validated.taskId ?? null,
      validated.sensitivity,
      validated.createdAt,
      validated.metadata ? JSON.stringify(validated.metadata) : null
    );
  }

  public findById(id: string): Attachment | null {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM attachments WHERE id = ?;
    `);
    const row = stmt.get(id) as AttachmentRow | undefined;
    return row ? this.rowToAttachment(row) : null;
  }

  public findByHash(sha256: string): Attachment | null {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM attachments WHERE sha256 = ? LIMIT 1;
    `);
    const row = stmt.get(sha256) as AttachmentRow | undefined;
    return row ? this.rowToAttachment(row) : null;
  }

  public listBySession(sessionId: string): Attachment[] {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM attachments WHERE session_id = ? ORDER BY created_at ASC;
    `);
    const rows = stmt.all(sessionId) as unknown as AttachmentRow[];
    return rows.map((r) => this.rowToAttachment(r));
  }
}
