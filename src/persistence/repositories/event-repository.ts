import { HarnessEventSchema, freezeEvent, type HarnessEvent } from "../../domain/event.js";
import type { SqliteEngine } from "../sqlite-engine.js";

interface EventRow {
  id: string;
  schema_version: number;
  project_id: string | null;
  session_id: string | null;
  task_id: string | null;
  agent_id: string | null;
  type: string;
  actor: string;
  timestamp: string;
  payload_json: string;
  correlation_id: string | null;
  parent_event_id: string | null;
}

export class EventRepository {
  private readonly engine: SqliteEngine;

  constructor(engine: SqliteEngine) {
    this.engine = engine;
  }

  private rowToEvent(row: EventRow): Readonly<HarnessEvent> {
    const rawObj = {
      id: row.id,
      schemaVersion: row.schema_version,
      projectId: row.project_id ?? undefined,
      sessionId: row.session_id ?? undefined,
      taskId: row.task_id ?? undefined,
      agentId: row.agent_id ?? undefined,
      type: row.type,
      actor: row.actor,
      timestamp: row.timestamp,
      payload: JSON.parse(row.payload_json),
      correlationId: row.correlation_id ?? undefined,
      parentEventId: row.parent_event_id ?? undefined,
    };
    const validated = HarnessEventSchema.parse(rawObj);
    return freezeEvent(validated);
  }

  /**
   * Appends an immutable HarnessEvent to the authoritative store.
   * Section 40: "Once committed, an authoritative event cannot be edited in place."
   */
  public append(event: HarnessEvent): Readonly<HarnessEvent> {
    const validated = HarnessEventSchema.parse(event);

    const stmt = this.engine.raw.prepare(`
      INSERT INTO events (
        id, schema_version, project_id, session_id, task_id,
        agent_id, type, actor, timestamp, payload_json,
        correlation_id, parent_event_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);

    stmt.run(
      validated.id,
      validated.schemaVersion,
      validated.projectId ?? null,
      validated.sessionId ?? null,
      validated.taskId ?? null,
      validated.agentId ?? null,
      validated.type,
      validated.actor,
      validated.timestamp,
      JSON.stringify(validated.payload),
      validated.correlationId ?? null,
      validated.parentEventId ?? null
    );

    return freezeEvent(validated);
  }

  public findById(id: string): Readonly<HarnessEvent> | null {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM events WHERE id = ?;
    `);
    const row = stmt.get(id) as EventRow | undefined;
    return row ? this.rowToEvent(row) : null;
  }

  public listBySession(
    sessionId: string,
    options?: { type?: string; limit?: number; offset?: number }
  ): Readonly<HarnessEvent>[] {
    let sql = "SELECT * FROM events WHERE session_id = ?";
    const params: (string | number | null)[] = [sessionId];

    if (options?.type) {
      sql += " AND type = ?";
      params.push(options.type);
    }
    sql += " ORDER BY timestamp ASC";

    if (options?.limit) {
      sql += " LIMIT ?";
      params.push(options.limit);
      if (options?.offset) {
        sql += " OFFSET ?";
        params.push(options.offset);
      }
    }
    sql += ";";

    const stmt = this.engine.raw.prepare(sql);
    const rows = stmt.all(...params) as unknown as EventRow[];
    return rows.map((r) => this.rowToEvent(r));
  }

  public listByProject(
    projectId: string,
    options?: { type?: string; limit?: number; offset?: number }
  ): Readonly<HarnessEvent>[] {
    let sql = "SELECT * FROM events WHERE project_id = ?";
    const params: (string | number | null)[] = [projectId];

    if (options?.type) {
      sql += " AND type = ?";
      params.push(options.type);
    }
    sql += " ORDER BY timestamp ASC";

    if (options?.limit) {
      sql += " LIMIT ?";
      params.push(options.limit);
      if (options?.offset) {
        sql += " OFFSET ?";
        params.push(options.offset);
      }
    }
    sql += ";";

    const stmt = this.engine.raw.prepare(sql);
    const rows = stmt.all(...params) as unknown as EventRow[];
    return rows.map((r) => this.rowToEvent(r));
  }

  public countBySession(sessionId: string): number {
    const stmt = this.engine.raw.prepare(`
      SELECT COUNT(*) as count FROM events WHERE session_id = ?;
    `);
    const row = stmt.get(sessionId) as { count: number };
    return row.count;
  }
}
