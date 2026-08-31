import { randomUUID } from "node:crypto";
import { PeerMessage, PeerMessageSchema, TeamRole } from "../domain/team.js";
import { EventTypes } from "../domain/event.js";
import { EventStore } from "../event-state/event-store.js";
import { PeerMessageRepository } from "../persistence/repositories/peer-message-repository.js";
import { TeamRepository } from "../persistence/repositories/team-repository.js";
import { TeamTopologyEvaluator } from "./team-topology-evaluator.js";

export interface PeerMessengerOptions {
  teamRepo: TeamRepository;
  messageRepo: PeerMessageRepository;
  topologyEvaluator?: TeamTopologyEvaluator;
  eventStore?: EventStore;
}

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Peer Messenger coordinating structured, policy-authorized agent-to-agent
 * communication and artifact passing.
 * PRD Part 2 Section 46, Section 47.
 */
export class PeerMessenger {
  private readonly teamRepo: TeamRepository;
  private readonly messageRepo: PeerMessageRepository;
  private readonly topologyEvaluator: TeamTopologyEvaluator;
  private readonly eventStore?: EventStore;

  constructor(options: PeerMessengerOptions) {
    this.teamRepo = options.teamRepo;
    this.messageRepo = options.messageRepo;
    this.topologyEvaluator = options.topologyEvaluator ?? new TeamTopologyEvaluator();
    this.eventStore = options.eventStore;
  }

  /**
   * Send a policy-authorized peer message.
   */
  public sendMessage(message: PeerMessage): SendMessageResult {
    // 1. Validate payload schema
    try {
      PeerMessageSchema.parse(message);
    } catch (err: any) {
      return {
        success: false,
        errorCode: "INVALID_MESSAGE_SCHEMA",
        errorMessage: err.message,
      };
    }

    // 2. Fetch Team
    const team = this.teamRepo.findById(message.teamId);
    if (!team) {
      return {
        success: false,
        errorCode: "TEAM_NOT_FOUND",
        errorMessage: `Team "${message.teamId}" not found`,
      };
    }

    // 3. Project Boundary Check
    if (team.projectId !== message.projectId) {
      return {
        success: false,
        errorCode: "PROJECT_ISOLATION_VIOLATION",
        errorMessage: `Team "${message.teamId}" belongs to project "${team.projectId}", not "${message.projectId}"`,
      };
    }

    // 4. Sender Membership Check
    const senderMember = this.teamRepo.getMemberByInstance(message.teamId, message.senderInstanceId);
    if (!senderMember || senderMember.status !== "ACTIVE") {
      return {
        success: false,
        errorCode: "SENDER_NOT_ACTIVE_MEMBER",
        errorMessage: `Sender instance "${message.senderInstanceId}" is not an active member of team "${message.teamId}"`,
      };
    }

    // 5. Recipient Membership Check (if not broadcast)
    let recipientRole: TeamRole | "broadcast" = "broadcast";
    if (message.recipientAgentId !== "broadcast") {
      const members = this.teamRepo.getMembers(message.teamId);
      const recipientMember = members.find((m) => m.agentId === message.recipientAgentId && m.status === "ACTIVE");
      if (!recipientMember) {
        return {
          success: false,
          errorCode: "RECIPIENT_NOT_ACTIVE_MEMBER",
          errorMessage: `Recipient agent "${message.recipientAgentId}" is not an active member of team "${message.teamId}"`,
        };
      }
      recipientRole = recipientMember.role;
    }

    // 6. Topology Authorization Check
    const isPermitted = this.topologyEvaluator.isCommunicationPermitted(
      team,
      senderMember.role,
      recipientRole,
      message.messageType
    );
    if (!isPermitted) {
      return {
        success: false,
        errorCode: "TOPOLOGY_COMMUNICATION_BLOCKED",
        errorMessage: `Communication of type "${message.messageType}" from role "${senderMember.role}" to "${recipientRole}" is blocked by "${team.topology}" topology rules`,
      };
    }

    // 7. Message Size Limit Check
    const maxBytes = team.communicationPolicy.maxMessageSizeBytes ?? 65536;
    const payloadStr = JSON.stringify(message.payload);
    if (Buffer.byteLength(payloadStr, "utf8") > maxBytes) {
      return {
        success: false,
        errorCode: "MESSAGE_SIZE_EXCEEDED",
        errorMessage: `Message payload size (${Buffer.byteLength(payloadStr, "utf8")} bytes) exceeds limit of ${maxBytes} bytes. Use Artifact references for large data.`,
      };
    }

    // 8. Persist message
    this.messageRepo.save(message);

    // 9. Emit durable event
    this.emitEvent(EventTypes.PEER_MESSAGE_SENT, {
      messageId: message.id,
      teamId: message.teamId,
      projectId: message.projectId,
      senderAgentId: message.senderAgentId,
      senderInstanceId: message.senderInstanceId,
      recipientAgentId: message.recipientAgentId,
      messageType: message.messageType,
      taskRef: message.taskRef,
      artifactRefs: message.artifactRefs,
      timestamp: message.timestamp,
    });

    return {
      success: true,
      messageId: message.id,
    };
  }

  public listMessages(teamId: string, limit: number = 100): PeerMessage[] {
    return this.messageRepo.listByTeam(teamId, limit);
  }

  public listMessagesForAgent(teamId: string, agentId: string): PeerMessage[] {
    return this.messageRepo.listForAgent(teamId, agentId);
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
        taskId: payload.taskRef ? (payload.taskRef as string) : undefined,
        agentId: payload.senderAgentId ? (payload.senderAgentId as string) : undefined,
        payload,
        timestamp: new Date().toISOString(),
      });
    } catch {
      // EventStore logging failure must not crash execution
    }
  }
}
