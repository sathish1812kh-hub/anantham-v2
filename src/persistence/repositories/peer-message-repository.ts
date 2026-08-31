import { PeerMessage, PeerMessageSchema } from "../../domain/team.js";
import type { SqliteEngine } from "../sqlite-engine.js";

interface PeerMessageRow {
  id: string;
  team_id: string;
  project_id: string;
  sender_agent_id: string;
  sender_instance_id: string;
  recipient_agent_id: string;
  message_type: string;
  payload_json: string;
  task_ref: string | null;
  artifact_refs_json: string | null;
  timestamp: string;
  correlation_id: string | null;
  causation_id: string | null;
}

export class PeerMessageRepository {
  private readonly engine: SqliteEngine;

  constructor(engine: SqliteEngine) {
    this.engine = engine;
  }

  private rowToMessage(row: PeerMessageRow): PeerMessage {
    return PeerMessageSchema.parse({
      id: row.id,
      teamId: row.team_id,
      projectId: row.project_id,
      senderAgentId: row.sender_agent_id,
      senderInstanceId: row.sender_instance_id,
      recipientAgentId: row.recipient_agent_id,
      messageType: row.message_type,
      payload: JSON.parse(row.payload_json),
      taskRef: row.task_ref ?? undefined,
      artifactRefs: row.artifact_refs_json ? JSON.parse(row.artifact_refs_json) : [],
      timestamp: row.timestamp,
      correlationId: row.correlation_id ?? undefined,
      causationId: row.causation_id ?? undefined,
    });
  }

  public save(message: PeerMessage): void {
    const validated = PeerMessageSchema.parse(message);

    const stmt = this.engine.raw.prepare(`
      INSERT INTO peer_messages (
        id, team_id, project_id, sender_agent_id, sender_instance_id,
        recipient_agent_id, message_type, payload_json, task_ref,
        artifact_refs_json, timestamp, correlation_id, causation_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);

    stmt.run(
      validated.id,
      validated.teamId,
      validated.projectId,
      validated.senderAgentId,
      validated.senderInstanceId,
      validated.recipientAgentId,
      validated.messageType,
      JSON.stringify(validated.payload),
      validated.taskRef ?? null,
      JSON.stringify(validated.artifactRefs),
      validated.timestamp,
      validated.correlationId ?? null,
      validated.causationId ?? null
    );
  }

  public findById(id: string): PeerMessage | null {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM peer_messages WHERE id = ?;
    `);
    const row = stmt.get(id) as PeerMessageRow | undefined;
    return row ? this.rowToMessage(row) : null;
  }

  public listByTeam(teamId: string, limit: number = 100): PeerMessage[] {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM peer_messages
      WHERE team_id = ?
      ORDER BY timestamp ASC
      LIMIT ?;
    `);
    const rows = stmt.all(teamId, limit) as unknown as PeerMessageRow[];
    return rows.map((r) => this.rowToMessage(r));
  }

  public listForAgent(teamId: string, agentId: string): PeerMessage[] {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM peer_messages
      WHERE team_id = ? AND (recipient_agent_id = ? OR recipient_agent_id = 'broadcast')
      ORDER BY timestamp ASC;
    `);
    const rows = stmt.all(teamId, agentId) as unknown as PeerMessageRow[];
    return rows.map((r) => this.rowToMessage(r));
  }
}
