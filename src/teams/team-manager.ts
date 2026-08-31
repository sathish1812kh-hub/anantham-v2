import { randomUUID } from "node:crypto";
import {
  TeamDefinition,
  TeamDefinitionSchema,
  TeamFailurePolicy,
  TeamMember,
  TeamMemberSchema,
  TeamMemberStatus,
} from "../domain/team.js";
import { EventTypes } from "../domain/event.js";
import { EventStore } from "../event-state/event-store.js";
import { TeamRepository } from "../persistence/repositories/team-repository.js";
import { AgentManager } from "../agents/agent-manager.js";
import { TaskClaimManager } from "../tasks/task-claim-manager.js";

export interface TeamManagerOptions {
  teamRepo: TeamRepository;
  agentManager?: AgentManager;
  claimManager?: TaskClaimManager;
  eventStore?: EventStore;
}

export interface AddMemberResult {
  success: boolean;
  member?: TeamMember;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Team Manager coordinating team lifecycle, membership, failure propagation,
 * cancellation cascading, and crash recovery.
 * PRD Part 2 Section 42, Section 44.
 */
export class TeamManager {
  private readonly teamRepo: TeamRepository;
  private readonly agentManager?: AgentManager;
  private readonly claimManager?: TaskClaimManager;
  private readonly eventStore?: EventStore;

  constructor(options: TeamManagerOptions) {
    this.teamRepo = options.teamRepo;
    this.agentManager = options.agentManager;
    this.claimManager = options.claimManager;
    this.eventStore = options.eventStore;
  }

  public getClaimManager(): TaskClaimManager | undefined {
    return this.claimManager;
  }

  /**
   * Create and activate a versioned team.
   */
  public createTeam(
    definition: Omit<TeamDefinition, "status" | "createdAt" | "updatedAt">
  ): TeamDefinition {
    const nowIso = new Date().toISOString();
    const team: TeamDefinition = {
      ...definition,
      status: "ACTIVE",
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    TeamDefinitionSchema.parse(team);
    this.teamRepo.save(team);

    // Save initial members if present
    for (const member of team.members) {
      this.teamRepo.saveMember(member);
    }

    this.emitEvent(EventTypes.TEAM_CREATED, {
      teamId: team.id,
      version: team.version,
      name: team.name,
      projectId: team.projectId,
      topology: team.topology,
      roles: team.roles,
    });

    return team;
  }

  /**
   * Add a verified member to an active team.
   */
  public addMember(
    teamId: string,
    params: Omit<TeamMember, "joinedAt" | "status">
  ): AddMemberResult {
    const team = this.teamRepo.findById(teamId);
    if (!team) {
      return {
        success: false,
        errorCode: "TEAM_NOT_FOUND",
        errorMessage: `Team "${teamId}" not found`,
      };
    }

    if (team.status !== "ACTIVE" && team.status !== "DRAFT") {
      return {
        success: false,
        errorCode: "TEAM_NOT_ACTIVE",
        errorMessage: `Cannot add member to team "${teamId}" in state "${team.status}"`,
      };
    }

    // Role check
    if (!team.roles.includes(params.role)) {
      return {
        success: false,
        errorCode: "INVALID_TEAM_ROLE",
        errorMessage: `Role "${params.role}" is not defined in team "${teamId}" roles: [${team.roles.join(", ")}]`,
      };
    }

    // Capacity check
    const currentMembers = this.teamRepo.getMembers(teamId);
    if (currentMembers.length >= team.maxMembers) {
      return {
        success: false,
        errorCode: "MAX_MEMBERS_EXCEEDED",
        errorMessage: `Team "${teamId}" has reached maximum member capacity of ${team.maxMembers}`,
      };
    }

    const nowIso = new Date().toISOString();
    const member: TeamMember = {
      agentId: params.agentId,
      instanceId: params.instanceId,
      teamId,
      role: params.role,
      status: "ACTIVE",
      joinedAt: nowIso,
      metadata: params.metadata,
    };

    TeamMemberSchema.parse(member);
    this.teamRepo.saveMember(member);

    this.emitEvent(EventTypes.TEAM_MEMBER_JOINED, {
      teamId,
      agentId: member.agentId,
      instanceId: member.instanceId,
      role: member.role,
      projectId: team.projectId,
    });

    return {
      success: true,
      member,
    };
  }

  public updateMemberStatus(
    teamId: string,
    instanceId: string,
    status: TeamMemberStatus
  ): void {
    this.teamRepo.updateMemberStatus(teamId, instanceId, status);
  }

  /**
   * Handle team member failure according to failure policy.
   * PRD Part 2 Section 50.
   */
  public handleMemberFailure(
    teamId: string,
    instanceId: string,
    error: string,
    policy: TeamFailurePolicy = "RETRY"
  ): { action: TeamFailurePolicy; status: string } {
    const team = this.teamRepo.findById(teamId);
    this.teamRepo.updateMemberStatus(teamId, instanceId, "FAILED");

    if (policy === "FAIL_TEAM" && team) {
      team.status = "CANCELLED";
      team.updatedAt = new Date().toISOString();
      this.teamRepo.save(team);
      this.cancelTeam(teamId, `Member "${instanceId}" failed: ${error}`);
      return { action: "FAIL_TEAM", status: "TEAM_CANCELLED" };
    }

    return { action: policy, status: "MEMBER_FAILED" };
  }

  /**
   * Cancel team and propagate shutdown to all member instances.
   */
  public cancelTeam(teamId: string, reason?: string): boolean {
    const team = this.teamRepo.findById(teamId);
    if (!team) return false;

    team.status = "CANCELLED";
    team.updatedAt = new Date().toISOString();
    this.teamRepo.save(team);

    const members = this.teamRepo.getMembers(teamId);
    for (const member of members) {
      this.teamRepo.updateMemberStatus(teamId, member.instanceId, "PAUSED");
      if (this.agentManager) {
        this.agentManager.stopInstance(member.instanceId);
      }
    }

    this.emitEvent(EventTypes.TEAM_CANCELLED, {
      teamId,
      projectId: team.projectId,
      reason: reason ?? "Manual team cancellation",
    });

    return true;
  }

  /**
   * Reconstruct and recover team state on system restart.
   */
  public recoverTeamState(teamId: string): {
    team: TeamDefinition | null;
    members: TeamMember[];
  } {
    const team = this.teamRepo.findById(teamId);
    const members = team ? this.teamRepo.getMembers(teamId) : [];
    return { team, members };
  }

  private emitEvent(type: string, payload: Record<string, unknown>): void {
    if (!this.eventStore) return;
    try {
      this.eventStore.append({
        id: `evt_${randomUUID()}`,
        schemaVersion: 1,
        type,
        actor: "system",
        projectId: (payload.projectId as string) || "system",
        payload,
        timestamp: new Date().toISOString(),
      });
    } catch {
      // EventStore logging failure must not crash execution
    }
  }
}
