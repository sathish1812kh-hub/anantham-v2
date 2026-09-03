/**
 * Team Management & Shared Workspaces
 * PRD-SAAS-004: Team Management & Shared Workspaces
 */

import type { UserRole } from "./rbac-engine.js";

export interface TeamMember {
  userId: string;
  role: UserRole;
  joinedAt: string;
}

export interface Team {
  teamId: string;
  name: string;
  ownerId: string;
  members: TeamMember[];
  sharedProjectIds: string[];
}

export class TeamWorkspaceManager {
  private teams: Map<string, Team> = new Map();

  public createTeam(teamId: string, name: string, ownerId: string): Team {
    const team: Team = {
      teamId,
      name,
      ownerId,
      members: [{ userId: ownerId, role: "owner", joinedAt: new Date().toISOString() }],
      sharedProjectIds: [],
    };
    this.teams.set(teamId, team);
    return team;
  }

  public addMember(teamId: string, userId: string, role: UserRole = "member"): void {
    const team = this.teams.get(teamId);
    if (!team) throw new Error(`Team ${teamId} not found`);

    if (!team.members.some((m) => m.userId === userId)) {
      team.members.push({ userId, role, joinedAt: new Date().toISOString() });
    }
  }

  public removeMember(teamId: string, userId: string): void {
    const team = this.teams.get(teamId);
    if (!team) throw new Error(`Team ${teamId} not found`);
    team.members = team.members.filter((m) => m.userId !== userId);
  }

  public shareProject(teamId: string, projectId: string): void {
    const team = this.teams.get(teamId);
    if (!team) throw new Error(`Team ${teamId} not found`);
    if (!team.sharedProjectIds.includes(projectId)) {
      team.sharedProjectIds.push(projectId);
    }
  }

  public getTeam(teamId: string): Team | undefined {
    return this.teams.get(teamId);
  }
}
