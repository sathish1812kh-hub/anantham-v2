import {
  CheckpointSchema,
  freezeCheckpoint,
  type Checkpoint,
} from "../../domain/checkpoint.js";
import type { SqliteEngine } from "../sqlite-engine.js";

interface CheckpointRow {
  id: string;
  type: string;
  project_id: string;
  session_id: string;
  manifest_json: string;
  sha256: string;
  created_at: string;
  validation_checksum: string;
}

export class CheckpointRepository {
  private readonly engine: SqliteEngine;

  constructor(engine: SqliteEngine) {
    this.engine = engine;
  }

  private rowToCheckpoint(row: CheckpointRow): Readonly<Checkpoint> {
    const rawObj = {
      id: row.id,
      type: row.type,
      projectId: row.project_id,
      sessionId: row.session_id,
      manifest: JSON.parse(row.manifest_json),
      sha256: row.sha256,
      createdAt: row.created_at,
      validationChecksum: row.validation_checksum,
    };
    const validated = CheckpointSchema.parse(rawObj);
    return freezeCheckpoint(validated);
  }

  public save(checkpoint: Checkpoint): Readonly<Checkpoint> {
    const validated = CheckpointSchema.parse(checkpoint);

    const stmt = this.engine.raw.prepare(`
      INSERT INTO checkpoints (
        id, type, project_id, session_id, manifest_json,
        sha256, created_at, validation_checksum
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    `);

    stmt.run(
      validated.id,
      validated.type,
      validated.projectId,
      validated.sessionId,
      JSON.stringify(validated.manifest),
      validated.sha256,
      validated.createdAt,
      validated.validationChecksum
    );

    return freezeCheckpoint(validated);
  }

  public findById(id: string): Readonly<Checkpoint> | null {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM checkpoints WHERE id = ?;
    `);
    const row = stmt.get(id) as CheckpointRow | undefined;
    return row ? this.rowToCheckpoint(row) : null;
  }

  public findLatestBySession(sessionId: string): Readonly<Checkpoint> | null {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM checkpoints
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT 1;
    `);
    const row = stmt.get(sessionId) as CheckpointRow | undefined;
    return row ? this.rowToCheckpoint(row) : null;
  }

  public listBySession(sessionId: string): Readonly<Checkpoint>[] {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM checkpoints
      WHERE session_id = ?
      ORDER BY created_at DESC;
    `);
    const rows = stmt.all(sessionId) as unknown as CheckpointRow[];
    return rows.map((r) => this.rowToCheckpoint(r));
  }
}
