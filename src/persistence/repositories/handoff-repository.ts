import { AgentHandoff, AgentHandoffSchema, HandoffStatus } from "../../domain/team.js";
import type { SqliteEngine } from "../sqlite-engine.js";

interface HandoffRow {
  id: string;
  team_id: string;
  project_id: string;
  source_agent_id: string;
  source_instance_id: string;
  target_agent_id: string;
  target_instance_id: string | null;
  task_id: string;
  lease_id: string;
  generation: number;
  status: string;
  details_json: string;
  created_at: string;
  updated_at: string;
}

export class HandoffRepository {
  private readonly engine: SqliteEngine;

  constructor(engine: SqliteEngine) {
    this.engine = engine;
  }

  private rowToHandoff(row: HandoffRow): AgentHandoff {
    const details = JSON.parse(row.details_json);
    return AgentHandoffSchema.parse({
      id: row.id,
      teamId: row.team_id,
      projectId: row.project_id,
      sourceAgentId: row.source_agent_id,
      sourceInstanceId: row.source_instance_id,
      targetAgentId: row.target_agent_id,
      targetInstanceId: row.target_instance_id ?? undefined,
      taskId: row.task_id,
      leaseId: row.lease_id,
      generation: row.generation,
      status: row.status,
      objective: details.objective,
      acceptanceCriteria: details.acceptanceCriteria ?? [],
      completedWork: details.completedWork,
      unresolvedIssues: details.unresolvedIssues ?? [],
      artifactRefs: details.artifactRefs ?? [],
      verificationEvidence: details.verificationEvidence,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  public save(handoff: AgentHandoff): void {
    const validated = AgentHandoffSchema.parse(handoff);
    const details = {
      objective: validated.objective,
      acceptanceCriteria: validated.acceptanceCriteria,
      completedWork: validated.completedWork,
      unresolvedIssues: validated.unresolvedIssues,
      artifactRefs: validated.artifactRefs,
      verificationEvidence: validated.verificationEvidence,
    };

    const stmt = this.engine.raw.prepare(`
      INSERT INTO agent_handoffs (
        id, team_id, project_id, source_agent_id, source_instance_id,
        target_agent_id, target_instance_id, task_id, lease_id,
        generation, status, details_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        target_instance_id = excluded.target_instance_id,
        status = excluded.status,
        details_json = excluded.details_json,
        updated_at = excluded.updated_at;
    `);

    stmt.run(
      validated.id,
      validated.teamId,
      validated.projectId,
      validated.sourceAgentId,
      validated.sourceInstanceId,
      validated.targetAgentId,
      validated.targetInstanceId ?? null,
      validated.taskId,
      validated.leaseId,
      validated.generation,
      validated.status,
      JSON.stringify(details),
      validated.createdAt,
      validated.updatedAt
    );
  }

  public findById(id: string): AgentHandoff | null {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM agent_handoffs WHERE id = ?;
    `);
    const row = stmt.get(id) as HandoffRow | undefined;
    return row ? this.rowToHandoff(row) : null;
  }

  public listByTask(taskId: string): AgentHandoff[] {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM agent_handoffs WHERE task_id = ? ORDER BY created_at ASC;
    `);
    const rows = stmt.all(taskId) as unknown as HandoffRow[];
    return rows.map((r) => this.rowToHandoff(r));
  }

  public updateStatus(id: string, status: HandoffStatus): void {
    const stmt = this.engine.raw.prepare(`
      UPDATE agent_handoffs SET status = ?, updated_at = ? WHERE id = ?;
    `);
    stmt.run(status, new Date().toISOString(), id);
  }
}
