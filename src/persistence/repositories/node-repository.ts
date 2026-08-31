import {
  type NodeIdentity,
  type NodeStatus,
  NodeIdentitySchema,
} from "../../domain/node.js";
import { SqliteEngine } from "../sqlite-engine.js";

interface RemoteNodeRow {
  id: string;
  node_version: string;
  runtime_version: string;
  capabilities_json: string;
  executor_profiles_json: string;
  supported_models_json: string;
  supported_tools_json: string;
  project_scope_json: string;
  status: string;
  endpoint_url: string;
  registered_at: string;
  last_heartbeat_at: string;
  auth_token_hash: string | null;
  metadata_json: string | null;
}

/**
 * SQLite Repository for Remote Nodes.
 * PRD Part 2 Section 140–165.
 */
export class NodeRepository {
  constructor(private readonly engine: SqliteEngine) {}

  public saveNode(node: NodeIdentity): void {
    const validated = NodeIdentitySchema.parse(node);
    const stmt = this.engine.raw.prepare(`
      INSERT INTO remote_nodes (
        id, node_version, runtime_version, capabilities_json,
        executor_profiles_json, supported_models_json, supported_tools_json,
        project_scope_json, status, endpoint_url, registered_at,
        last_heartbeat_at, auth_token_hash, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        node_version = excluded.node_version,
        runtime_version = excluded.runtime_version,
        capabilities_json = excluded.capabilities_json,
        executor_profiles_json = excluded.executor_profiles_json,
        supported_models_json = excluded.supported_models_json,
        supported_tools_json = excluded.supported_tools_json,
        project_scope_json = excluded.project_scope_json,
        status = excluded.status,
        endpoint_url = excluded.endpoint_url,
        last_heartbeat_at = excluded.last_heartbeat_at,
        auth_token_hash = excluded.auth_token_hash,
        metadata_json = excluded.metadata_json;
    `);

    stmt.run(
      validated.id,
      validated.nodeVersion,
      validated.runtimeVersion,
      JSON.stringify(validated.capabilities),
      JSON.stringify(validated.executorProfiles),
      JSON.stringify(validated.supportedModels),
      JSON.stringify(validated.supportedTools),
      JSON.stringify(validated.projectScope),
      validated.status,
      validated.endpointUrl,
      validated.registeredAt,
      validated.lastHeartbeatAt,
      validated.authTokenHash ?? null,
      JSON.stringify(validated.metadata)
    );
  }

  public findNodeById(id: string): NodeIdentity | null {
    const stmt = this.engine.raw.prepare(`SELECT * FROM remote_nodes WHERE id = ?;`);
    const row = stmt.get(id) as unknown as RemoteNodeRow | undefined;
    if (!row) return null;
    return this.mapRow(row);
  }

  public listAllNodes(): NodeIdentity[] {
    const stmt = this.engine.raw.prepare(`SELECT * FROM remote_nodes ORDER BY registered_at DESC;`);
    const rows = stmt.all() as unknown as RemoteNodeRow[];
    return rows.map((r) => this.mapRow(r));
  }

  public listOnlineNodes(): NodeIdentity[] {
    const stmt = this.engine.raw.prepare(
      `SELECT * FROM remote_nodes WHERE status IN ('ONLINE', 'BUSY') ORDER BY registered_at DESC;`
    );
    const rows = stmt.all() as unknown as RemoteNodeRow[];
    return rows.map((r) => this.mapRow(r));
  }

  public listStalledNodes(staleBeforeIso: string): NodeIdentity[] {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM remote_nodes 
      WHERE status IN ('ONLINE', 'BUSY') 
        AND last_heartbeat_at < ?
      ORDER BY last_heartbeat_at ASC;
    `);
    const rows = stmt.all(staleBeforeIso) as unknown as RemoteNodeRow[];
    return rows.map((r) => this.mapRow(r));
  }

  public updateHeartbeat(nodeId: string, heartbeatIso: string, status?: NodeStatus): void {
    if (status) {
      const stmt = this.engine.raw.prepare(
        `UPDATE remote_nodes SET last_heartbeat_at = ?, status = ? WHERE id = ?;`
      );
      stmt.run(heartbeatIso, status, nodeId);
    } else {
      const stmt = this.engine.raw.prepare(
        `UPDATE remote_nodes SET last_heartbeat_at = ? WHERE id = ?;`
      );
      stmt.run(heartbeatIso, nodeId);
    }
  }

  public deleteNode(id: string): void {
    const stmt = this.engine.raw.prepare(`DELETE FROM remote_nodes WHERE id = ?;`);
    stmt.run(id);
  }

  private mapRow(row: RemoteNodeRow): NodeIdentity {
    return NodeIdentitySchema.parse({
      id: row.id,
      nodeVersion: row.node_version,
      runtimeVersion: row.runtime_version,
      capabilities: JSON.parse(row.capabilities_json),
      executorProfiles: JSON.parse(row.executor_profiles_json),
      supportedModels: JSON.parse(row.supported_models_json),
      supportedTools: JSON.parse(row.supported_tools_json),
      projectScope: JSON.parse(row.project_scope_json),
      status: row.status as NodeStatus,
      endpointUrl: row.endpoint_url,
      registeredAt: row.registered_at,
      lastHeartbeatAt: row.last_heartbeat_at,
      authTokenHash: row.auth_token_hash ?? undefined,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : {},
    });
  }
}
