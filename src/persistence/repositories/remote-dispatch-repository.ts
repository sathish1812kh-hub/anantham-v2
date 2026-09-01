import {
  type RemoteWorkRequest,
  type RemoteDispatchStatus,
  RemoteWorkRequestSchema,
} from "../../domain/node.js";
import { SqliteEngine } from "../sqlite-engine.js";

interface RemoteDispatchRow {
  id: string;
  job_id: string;
  task_id: string;
  workflow_id: string | null;
  run_id: string | null;
  agent_id: string;
  instance_id: string;
  node_id: string;
  project_id: string;
  session_id: string;
  plan_id: string | null;
  generation: number;
  lease_id: string;
  required_capabilities_json: string;
  budget_json: string | null;
  deadline: string | null;
  payload_json: string | null;
  idempotency_key: string;
  status: string;
  created_at: string;
  metadata_json: string | null;
}

/**
 * SQLite Repository for Remote Dispatches.
 * PRD Part 2 Section 140–165.
 */
export class RemoteDispatchRepository {
  constructor(private readonly engine: SqliteEngine) {}

  public get sqliteEngine(): SqliteEngine {
    return this.engine;
  }

  public saveDispatch(dispatch: RemoteWorkRequest): void {
    const validated = RemoteWorkRequestSchema.parse(dispatch);
    const stmt = this.engine.raw.prepare(`
      INSERT INTO remote_dispatches (
        id, job_id, task_id, workflow_id, run_id,
        agent_id, instance_id, node_id, project_id, session_id,
        plan_id, generation, lease_id, required_capabilities_json,
        budget_json, deadline, payload_json, idempotency_key,
        status, created_at, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        metadata_json = excluded.metadata_json;
    `);

    stmt.run(
      validated.dispatchId,
      validated.jobId,
      validated.taskId,
      validated.workflowId ?? null,
      validated.runId ?? null,
      validated.agentId,
      validated.instanceId,
      validated.nodeId,
      validated.projectId,
      validated.sessionId,
      validated.planId ?? null,
      validated.generation,
      validated.leaseId,
      JSON.stringify(validated.requiredCapabilities),
      validated.budget ? JSON.stringify(validated.budget) : null,
      validated.deadline ?? null,
      validated.payload !== undefined ? JSON.stringify(validated.payload) : null,
      validated.idempotencyKey,
      validated.status,
      validated.createdAt,
      JSON.stringify(validated.metadata)
    );
  }

  public findDispatchById(id: string): RemoteWorkRequest | null {
    const stmt = this.engine.raw.prepare(`SELECT * FROM remote_dispatches WHERE id = ?;`);
    const row = stmt.get(id) as unknown as RemoteDispatchRow | undefined;
    if (!row) return null;
    return this.mapRow(row);
  }

  public findDispatchByIdempotencyKey(key: string): RemoteWorkRequest | null {
    const stmt = this.engine.raw.prepare(`SELECT * FROM remote_dispatches WHERE idempotency_key = ?;`);
    const row = stmt.get(key) as unknown as RemoteDispatchRow | undefined;
    if (!row) return null;
    return this.mapRow(row);
  }

  public findDispatchByTaskId(taskId: string): RemoteWorkRequest | null {
    const stmt = this.engine.raw.prepare(`SELECT * FROM remote_dispatches WHERE task_id = ?;`);
    const row = stmt.get(taskId) as unknown as RemoteDispatchRow | undefined;
    if (!row) return null;
    return this.mapRow(row);
  }

  public listDispatchesByNode(nodeId: string, status?: RemoteDispatchStatus): RemoteWorkRequest[] {
    let sql = `SELECT * FROM remote_dispatches WHERE node_id = ?`;
    const params: string[] = [nodeId];
    if (status) {
      sql += ` AND status = ?`;
      params.push(status);
    }
    sql += ` ORDER BY created_at DESC;`;
    const stmt = this.engine.raw.prepare(sql);
    const rows = stmt.all(...params) as unknown as RemoteDispatchRow[];
    return rows.map((r) => this.mapRow(r));
  }

  public listDispatchesByProject(projectId: string): RemoteWorkRequest[] {
    const stmt = this.engine.raw.prepare(
      `SELECT * FROM remote_dispatches WHERE project_id = ? ORDER BY created_at DESC;`
    );
    const rows = stmt.all(projectId) as unknown as RemoteDispatchRow[];
    return rows.map((r) => this.mapRow(r));
  }

  public listActiveDispatches(): RemoteWorkRequest[] {
    const active = ["DISPATCHED", "ACCEPTED", "RUNNING"];
    const placeholders = active.map(() => "?").join(", ");
    const stmt = this.engine.raw.prepare(
      `SELECT * FROM remote_dispatches WHERE status IN (${placeholders}) ORDER BY created_at ASC;`
    );
    const rows = stmt.all(...active) as unknown as RemoteDispatchRow[];
    return rows.map((r) => this.mapRow(r));
  }

  public updateStatus(id: string, status: RemoteDispatchStatus): void {
    const stmt = this.engine.raw.prepare(`UPDATE remote_dispatches SET status = ? WHERE id = ?;`);
    stmt.run(status, id);
  }

  public deleteDispatch(id: string): void {
    const stmt = this.engine.raw.prepare(`DELETE FROM remote_dispatches WHERE id = ?;`);
    stmt.run(id);
  }

  private mapRow(row: RemoteDispatchRow): RemoteWorkRequest {
    return RemoteWorkRequestSchema.parse({
      dispatchId: row.id,
      jobId: row.job_id,
      taskId: row.task_id,
      workflowId: row.workflow_id ?? undefined,
      runId: row.run_id ?? undefined,
      agentId: row.agent_id,
      instanceId: row.instance_id,
      nodeId: row.node_id,
      projectId: row.project_id,
      sessionId: row.session_id,
      planId: row.plan_id ?? undefined,
      generation: row.generation,
      leaseId: row.lease_id,
      requiredCapabilities: JSON.parse(row.required_capabilities_json),
      budget: row.budget_json ? JSON.parse(row.budget_json) : undefined,
      deadline: row.deadline ?? undefined,
      payload: row.payload_json ? JSON.parse(row.payload_json) : undefined,
      idempotencyKey: row.idempotency_key,
      status: row.status as RemoteDispatchStatus,
      createdAt: row.created_at,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : {},
    });
  }
}
