import { TaskLeaseSchema, type TaskLease, type LeaseStatus } from "../../domain/lease.js";
import type { SqliteEngine } from "../sqlite-engine.js";

interface LeaseRow {
  id: string;
  task_id: string;
  agent_id: string;
  instance_id: string;
  project_id: string;
  session_id: string;
  generation: number;
  acquired_at: string;
  expires_at: string;
  last_heartbeat_at: string;
  ttl_ms: number;
  status: string;
  renewal_count: number;
  max_renewals: number;
  metadata_json: string | null;
}

export class LeaseRepository {
  private readonly engine: SqliteEngine;

  constructor(engine: SqliteEngine) {
    this.engine = engine;
  }

  private rowToLease(row: LeaseRow): TaskLease {
    const rawObj = {
      id: row.id,
      taskId: row.task_id,
      agentId: row.agent_id,
      instanceId: row.instance_id,
      projectId: row.project_id,
      sessionId: row.session_id,
      generation: row.generation,
      acquiredAt: row.acquired_at,
      expiresAt: row.expires_at,
      lastHeartbeatAt: row.last_heartbeat_at,
      ttlMs: row.ttl_ms,
      status: row.status,
      renewalCount: row.renewal_count,
      maxRenewals: row.max_renewals,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
    };
    return TaskLeaseSchema.parse(rawObj);
  }

  public save(lease: TaskLease): void {
    const validated = TaskLeaseSchema.parse(lease);

    const stmt = this.engine.raw.prepare(`
      INSERT INTO leases (
        id, task_id, agent_id, instance_id, project_id, session_id,
        generation, acquired_at, expires_at, last_heartbeat_at,
        ttl_ms, status, renewal_count, max_renewals, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        expires_at = excluded.expires_at,
        last_heartbeat_at = excluded.last_heartbeat_at,
        status = excluded.status,
        renewal_count = excluded.renewal_count,
        metadata_json = excluded.metadata_json;
    `);

    stmt.run(
      validated.id,
      validated.taskId,
      validated.agentId,
      validated.instanceId,
      validated.projectId,
      validated.sessionId,
      validated.generation,
      validated.acquiredAt,
      validated.expiresAt,
      validated.lastHeartbeatAt,
      validated.ttlMs,
      validated.status,
      validated.renewalCount,
      validated.maxRenewals,
      validated.metadata ? JSON.stringify(validated.metadata) : null
    );
  }

  public findById(id: string): TaskLease | null {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM leases WHERE id = ?;
    `);
    const row = stmt.get(id) as LeaseRow | undefined;
    return row ? this.rowToLease(row) : null;
  }

  public findActiveByTaskId(taskId: string): TaskLease | null {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM leases
      WHERE task_id = ? AND status = 'ACTIVE'
      ORDER BY generation DESC
      LIMIT 1;
    `);
    const row = stmt.get(taskId) as LeaseRow | undefined;
    return row ? this.rowToLease(row) : null;
  }

  public findLatestByTaskId(taskId: string): TaskLease | null {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM leases
      WHERE task_id = ?
      ORDER BY generation DESC
      LIMIT 1;
    `);
    const row = stmt.get(taskId) as LeaseRow | undefined;
    return row ? this.rowToLease(row) : null;
  }

  public listActiveByProject(projectId: string): TaskLease[] {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM leases
      WHERE project_id = ? AND status = 'ACTIVE'
      ORDER BY acquired_at ASC;
    `);
    const rows = stmt.all(projectId) as unknown as LeaseRow[];
    return rows.map((r) => this.rowToLease(r));
  }

  public listExpiredActive(nowIso: string): TaskLease[] {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM leases
      WHERE status = 'ACTIVE' AND expires_at <= ?
      ORDER BY expires_at ASC;
    `);
    const rows = stmt.all(nowIso) as unknown as LeaseRow[];
    return rows.map((r) => this.rowToLease(r));
  }

  public listAllActive(): TaskLease[] {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM leases
      WHERE status = 'ACTIVE'
      ORDER BY acquired_at ASC;
    `);
    const rows = stmt.all() as unknown as LeaseRow[];
    return rows.map((r) => this.rowToLease(r));
  }


  public updateStatus(id: string, status: LeaseStatus): void {
    const stmt = this.engine.raw.prepare(`
      UPDATE leases
      SET status = ?
      WHERE id = ?;
    `);
    stmt.run(status, id);
  }

  public delete(id: string): void {
    const stmt = this.engine.raw.prepare(`
      DELETE FROM leases WHERE id = ?;
    `);
    stmt.run(id);
  }
}
