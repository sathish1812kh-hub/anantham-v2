import { randomUUID } from "node:crypto";
import { AgentHandoff, AgentHandoffSchema } from "../domain/team.js";
import { TaskLease, TaskLeaseSchema } from "../domain/lease.js";
import { EventTypes } from "../domain/event.js";
import { EventStore } from "../event-state/event-store.js";
import { SqliteEngine } from "../persistence/sqlite-engine.js";
import { TaskRepository } from "../persistence/repositories/task-repository.js";
import { LeaseRepository } from "../persistence/repositories/lease-repository.js";
import { TeamRepository } from "../persistence/repositories/team-repository.js";
import { HandoffRepository } from "../persistence/repositories/handoff-repository.js";
import { TaskClaimManager } from "../tasks/task-claim-manager.js";
import { TeamTopologyEvaluator } from "./team-topology-evaluator.js";

export interface AgentHandoffManagerOptions {
  engine: SqliteEngine;
  taskRepo: TaskRepository;
  leaseRepo: LeaseRepository;
  teamRepo: TeamRepository;
  handoffRepo: HandoffRepository;
  claimManager: TaskClaimManager;
  topologyEvaluator?: TeamTopologyEvaluator;
  eventStore?: EventStore;
}

export interface PrepareHandoffResult {
  success: boolean;
  handoff?: AgentHandoff;
  errorCode?: string;
  errorMessage?: string;
}

export interface AcceptHandoffResult {
  success: boolean;
  handoff?: AgentHandoff;
  newLease?: TaskLease;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Agent Handoff Manager orchestrating atomic task responsibility transfer,
 * lease re-assignment with generation fencing bump, and receiver revalidation.
 * PRD Part 2 Section 49, Section 50.
 */
export class AgentHandoffManager {
  private readonly engine: SqliteEngine;
  private readonly taskRepo: TaskRepository;
  private readonly leaseRepo: LeaseRepository;
  private readonly teamRepo: TeamRepository;
  private readonly handoffRepo: HandoffRepository;
  private readonly claimManager: TaskClaimManager;
  private readonly topologyEvaluator: TeamTopologyEvaluator;
  private readonly eventStore?: EventStore;

  constructor(options: AgentHandoffManagerOptions) {
    this.engine = options.engine;
    this.taskRepo = options.taskRepo;
    this.leaseRepo = options.leaseRepo;
    this.teamRepo = options.teamRepo;
    this.handoffRepo = options.handoffRepo;
    this.claimManager = options.claimManager;
    this.topologyEvaluator = options.topologyEvaluator ?? new TeamTopologyEvaluator();
    this.eventStore = options.eventStore;
  }

  /**
   * Prepare an authoritative task handoff to another agent.
   */
  public prepareHandoff(
    params: Omit<AgentHandoff, "id" | "status" | "createdAt" | "updatedAt">
  ): PrepareHandoffResult {
    // 1. Verify source agent ownership and fencing token
    const isOwner = this.claimManager.verifyOwnership(
      params.taskId,
      params.leaseId,
      params.generation,
      params.sourceAgentId
    );
    if (!isOwner) {
      return {
        success: false,
        errorCode: "OWNERSHIP_VERIFICATION_FAILED",
        errorMessage: `Source agent "${params.sourceAgentId}" does not possess active ownership for task "${params.taskId}" with generation "${params.generation}"`,
      };
    }

    // 2. Fetch Team and verify memberships
    const team = this.teamRepo.findById(params.teamId);
    if (!team) {
      return {
        success: false,
        errorCode: "TEAM_NOT_FOUND",
        errorMessage: `Team "${params.teamId}" not found`,
      };
    }

    const sourceMember = this.teamRepo.getMemberByInstance(params.teamId, params.sourceInstanceId);
    if (!sourceMember || sourceMember.status !== "ACTIVE") {
      return {
        success: false,
        errorCode: "SOURCE_NOT_ACTIVE_MEMBER",
        errorMessage: `Source instance "${params.sourceInstanceId}" is not an active member of team "${params.teamId}"`,
      };
    }

    const members = this.teamRepo.getMembers(params.teamId);
    const targetMember = members.find((m) => m.agentId === params.targetAgentId && m.status === "ACTIVE");
    if (!targetMember) {
      return {
        success: false,
        errorCode: "TARGET_NOT_ACTIVE_MEMBER",
        errorMessage: `Target agent "${params.targetAgentId}" is not an active member of team "${params.teamId}"`,
      };
    }

    // 3. Check topology handoff legality
    const isPermitted = this.topologyEvaluator.isHandoffPermitted(team, sourceMember.role, targetMember.role);
    if (!isPermitted) {
      return {
        success: false,
        errorCode: "TOPOLOGY_HANDOFF_BLOCKED",
        errorMessage: `Handoff from role "${sourceMember.role}" to role "${targetMember.role}" is blocked under "${team.topology}" topology rules`,
      };
    }

    // 4. Create handoff record
    const handoffId = `handoff_${randomUUID()}`;
    const nowIso = new Date().toISOString();

    const handoff: AgentHandoff = {
      id: handoffId,
      teamId: params.teamId,
      projectId: params.projectId,
      sourceAgentId: params.sourceAgentId,
      sourceInstanceId: params.sourceInstanceId,
      targetAgentId: params.targetAgentId,
      targetInstanceId: params.targetInstanceId,
      taskId: params.taskId,
      leaseId: params.leaseId,
      generation: params.generation,
      objective: params.objective,
      acceptanceCriteria: params.acceptanceCriteria,
      completedWork: params.completedWork,
      unresolvedIssues: params.unresolvedIssues,
      artifactRefs: params.artifactRefs,
      verificationEvidence: params.verificationEvidence,
      status: "PREPARED",
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    AgentHandoffSchema.parse(handoff);
    this.handoffRepo.save(handoff);

    // 5. Emit durable event
    this.emitEvent(EventTypes.HANDOFF_PREPARED, {
      handoffId: handoff.id,
      teamId: handoff.teamId,
      projectId: handoff.projectId,
      taskId: handoff.taskId,
      sourceAgentId: handoff.sourceAgentId,
      targetAgentId: handoff.targetAgentId,
      generation: handoff.generation,
      artifactRefs: handoff.artifactRefs,
    });

    return {
      success: true,
      handoff,
    };
  }

  /**
   * Accept an authoritative task handoff, atomically transferring task lease
   * and incrementing the generation fencing token.
   * PRD Part 2 Section 49.
   */
  public acceptHandoff(
    handoffId: string,
    targetInstanceId: string
  ): AcceptHandoffResult {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    let result: AcceptHandoffResult;

    try {
      result = this.engine.transaction(() => {
        // 1. Fetch handoff
        const handoff = this.handoffRepo.findById(handoffId);
        if (!handoff) {
          return {
            success: false,
            errorCode: "HANDOFF_NOT_FOUND",
            errorMessage: `Handoff "${handoffId}" not found`,
          };
        }

        if (handoff.status !== "PREPARED") {
          return {
            success: false,
            errorCode: "HANDOFF_NOT_PREPARED",
            errorMessage: `Handoff "${handoffId}" is in state "${handoff.status}" and cannot be accepted`,
          };
        }

        // 2. Validate target member
        const targetMember = this.teamRepo.getMemberByInstance(handoff.teamId, targetInstanceId);
        if (!targetMember || targetMember.agentId !== handoff.targetAgentId || targetMember.status !== "ACTIVE") {
          return {
            success: false,
            errorCode: "TARGET_NOT_ACTIVE_MEMBER",
            errorMessage: `Target instance "${targetInstanceId}" does not match target agent "${handoff.targetAgentId}" or is not active in team "${handoff.teamId}"`,
          };
        }

        // 3. Release previous source lease
        const prevLease = this.leaseRepo.findById(handoff.leaseId);
        if (prevLease && prevLease.status === "ACTIVE") {
          this.leaseRepo.updateStatus(prevLease.id, "RELEASED");
        }

        // 4. Create new lease for target with incremented generation fencing token
        const newGeneration = handoff.generation + 1;
        const newLeaseId = `lease_${randomUUID()}`;
        const ttlMs = prevLease ? prevLease.ttlMs : 30000;

        const newLease: TaskLease = {
          id: newLeaseId,
          taskId: handoff.taskId,
          agentId: handoff.targetAgentId,
          instanceId: targetInstanceId,
          projectId: handoff.projectId,
          sessionId: prevLease ? prevLease.sessionId : "session_handoff",
          generation: newGeneration,
          acquiredAt: nowIso,
          expiresAt: new Date(now + ttlMs).toISOString(),
          lastHeartbeatAt: nowIso,
          ttlMs,
          status: "ACTIVE",
          renewalCount: 0,
          maxRenewals: prevLease ? prevLease.maxRenewals : 100,
          metadata: {
            transferredFrom: handoff.sourceAgentId,
            handoffId: handoff.id,
          },
        };

        TaskLeaseSchema.parse(newLease);
        this.leaseRepo.save(newLease);

        // 5. Update task state
        this.taskRepo.updateStatus(handoff.taskId, "claimed");

        // 6. Update handoff state -> ACCEPTED
        handoff.status = "ACCEPTED";
        handoff.targetInstanceId = targetInstanceId;
        handoff.updatedAt = nowIso;
        this.handoffRepo.save(handoff);

        return {
          success: true,
          handoff,
          newLease,
        };
      });
    } catch (err: any) {
      return {
        success: false,
        errorCode: "TRANSACTION_ERROR",
        errorMessage: err.message,
      };
    }

    if (result.success && result.handoff && result.newLease) {
      this.emitEvent(EventTypes.HANDOFF_ACCEPTED, {
        handoffId: result.handoff.id,
        taskId: result.handoff.taskId,
        sourceAgentId: result.handoff.sourceAgentId,
        targetAgentId: result.handoff.targetAgentId,
        targetInstanceId: result.handoff.targetInstanceId,
        newLeaseId: result.newLease.id,
        generation: result.newLease.generation,
        projectId: result.handoff.projectId,
      });

      this.emitEvent(EventTypes.TASK_LEASE_ACQUIRED, {
        leaseId: result.newLease.id,
        taskId: result.newLease.taskId,
        agentId: result.newLease.agentId,
        instanceId: result.newLease.instanceId,
        generation: result.newLease.generation,
        projectId: result.newLease.projectId,
        ttlMs: result.newLease.ttlMs,
      });
    }

    return result;
  }

  /**
   * Reject a prepared handoff.
   */
  public rejectHandoff(handoffId: string, reason: string): boolean {
    const handoff = this.handoffRepo.findById(handoffId);
    if (!handoff || handoff.status !== "PREPARED") return false;

    handoff.status = "REJECTED";
    handoff.unresolvedIssues.push(`Rejected: ${reason}`);
    handoff.updatedAt = new Date().toISOString();
    this.handoffRepo.save(handoff);

    this.emitEvent(EventTypes.HANDOFF_REJECTED, {
      handoffId: handoff.id,
      taskId: handoff.taskId,
      sourceAgentId: handoff.sourceAgentId,
      targetAgentId: handoff.targetAgentId,
      reason,
      projectId: handoff.projectId,
    });

    return true;
  }

  private emitEvent(type: string, payload: Record<string, unknown>): void {
    if (!this.eventStore) return;
    try {
      this.eventStore.append({
        id: `evt_${randomUUID()}`,
        schemaVersion: 1,
        type,
        actor: "agent",
        projectId: (payload.projectId as string) || "system",
        taskId: payload.taskId ? (payload.taskId as string) : undefined,
        agentId: payload.targetAgentId ? (payload.targetAgentId as string) : (payload.sourceAgentId as string),
        payload,
        timestamp: new Date().toISOString(),
      });
    } catch {
      // EventStore logging failure must not crash execution
    }
  }
}
