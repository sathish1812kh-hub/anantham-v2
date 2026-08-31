import { TeamDefinition, TeamDefinitionSchema, TeamMember, TeamMemberSchema, TeamMemberStatus } from "../../domain/team.js";
import type { SqliteEngine } from "../sqlite-engine.js";

interface TeamRow {
  id: string;
  version: number;
  project_id: string;
  name: string;
  topology: string;
  status: string;
  definition_json: string;
  created_at: string;
  updated_at: string;
}

interface MemberRow {
  team_id: string;
  agent_id: string;
  instance_id: string;
  role: string;
  status: string;
  joined_at: string;
  metadata_json: string | null;
}

export class TeamRepository {
  private readonly engine: SqliteEngine;

  constructor(engine: SqliteEngine) {
    this.engine = engine;
  }

  private rowToTeam(row: TeamRow): TeamDefinition {
    const parsed = JSON.parse(row.definition_json);
    return TeamDefinitionSchema.parse({
      ...parsed,
      id: row.id,
      version: row.version,
      projectId: row.project_id,
      name: row.name,
      topology: row.topology,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  private rowToMember(row: MemberRow): TeamMember {
    return TeamMemberSchema.parse({
      teamId: row.team_id,
      agentId: row.agent_id,
      instanceId: row.instance_id,
      role: row.role,
      status: row.status,
      joinedAt: row.joined_at,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
    });
  }

  public save(team: TeamDefinition): void {
    const validated = TeamDefinitionSchema.parse(team);

    const stmt = this.engine.raw.prepare(`
      INSERT INTO teams (
        id, version, project_id, name, topology, status,
        definition_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        version = excluded.version,
        name = excluded.name,
        topology = excluded.topology,
        status = excluded.status,
        definition_json = excluded.definition_json,
        updated_at = excluded.updated_at;
    `);

    stmt.run(
      validated.id,
      validated.version,
      validated.projectId,
      validated.name,
      validated.topology,
      validated.status,
      JSON.stringify(validated),
      validated.createdAt,
      validated.updatedAt
    );
  }

  public findById(id: string): TeamDefinition | null {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM teams WHERE id = ?;
    `);
    const row = stmt.get(id) as TeamRow | undefined;
    return row ? this.rowToTeam(row) : null;
  }

  public listByProject(projectId: string): TeamDefinition[] {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM teams WHERE project_id = ? ORDER BY created_at ASC;
    `);
    const rows = stmt.all(projectId) as unknown as TeamRow[];
    return rows.map((r) => this.rowToTeam(r));
  }

  public saveMember(member: TeamMember): void {
    const validated = TeamMemberSchema.parse(member);

    const stmt = this.engine.raw.prepare(`
      INSERT INTO team_members (
        team_id, agent_id, instance_id, role, status, joined_at, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(team_id, instance_id) DO UPDATE SET
        role = excluded.role,
        status = excluded.status,
        metadata_json = excluded.metadata_json;
    `);

    stmt.run(
      validated.teamId,
      validated.agentId,
      validated.instanceId,
      validated.role,
      validated.status,
      validated.joinedAt,
      validated.metadata ? JSON.stringify(validated.metadata) : null
    );
  }

  public getMembers(teamId: string): TeamMember[] {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM team_members WHERE team_id = ? ORDER BY joined_at ASC;
    `);
    const rows = stmt.all(teamId) as unknown as MemberRow[];
    return rows.map((r) => this.rowToMember(r));
  }

  public getMemberByInstance(teamId: string, instanceId: string): TeamMember | null {
    const stmt = this.engine.raw.prepare(`
      SELECT * FROM team_members WHERE team_id = ? AND instance_id = ?;
    `);
    const row = stmt.get(teamId, instanceId) as MemberRow | undefined;
    return row ? this.rowToMember(row) : null;
  }

  public updateMemberStatus(teamId: string, instanceId: string, status: TeamMemberStatus): void {
    const stmt = this.engine.raw.prepare(`
      UPDATE team_members SET status = ? WHERE team_id = ? AND instance_id = ?;
    `);
    stmt.run(status, teamId, instanceId);
  }

  public removeMember(teamId: string, instanceId: string): void {
    const stmt = this.engine.raw.prepare(`
      DELETE FROM team_members WHERE team_id = ? AND instance_id = ?;
    `);
    stmt.run(teamId, instanceId);
  }
}
