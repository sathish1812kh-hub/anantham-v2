import { PeerMessageType, TeamDefinition, TeamRole } from "../domain/team.js";

const PIPELINE_ORDER: Record<string, number> = {
  coordinator: 0,
  planner: 1,
  implementer: 2,
  reviewer: 3,
  verifier: 4,
};

/**
 * Team Topology Evaluator enforcing message and handoff communication rules.
 * PRD Part 2 Section 43, Section 47.
 */
export class TeamTopologyEvaluator {
  /**
   * Evaluate whether a peer message is permitted under the team's topology.
   */
  public isCommunicationPermitted(
    team: TeamDefinition,
    senderRole: TeamRole,
    recipientRole: TeamRole | "broadcast",
    messageType: PeerMessageType
  ): boolean {
    if (recipientRole === "broadcast") {
      if (team.topology === "peer_to_peer") return true;
      return senderRole === "coordinator" || senderRole === "planner";
    }

    if (senderRole === recipientRole) {
      return true; // Intra-role peer communication
    }

    switch (team.topology) {
      case "coordinator_workers":
        // Coordinator can talk to all workers, workers can talk to coordinator
        if (senderRole === "coordinator" || recipientRole === "coordinator") {
          return true;
        }
        // Direct worker-to-worker allowed only if policy allows
        return team.communicationPolicy.allowDirectPeerMessages ?? true;

      case "pipeline": {
        const senderIdx = PIPELINE_ORDER[senderRole];
        const recipientIdx = PIPELINE_ORDER[recipientRole];

        if (senderIdx === undefined || recipientIdx === undefined) {
          return false;
        }

        // Forward progression (e.g. planner -> implementer, implementer -> reviewer)
        if (recipientIdx === senderIdx + 1) {
          return true;
        }

        // Backward feedback (e.g. reviewer -> implementer, verifier -> implementer)
        if (
          (messageType === "REVIEW_RESULT" || messageType === "RESPONSE" || messageType === "ALERT") &&
          recipientIdx < senderIdx
        ) {
          return true;
        }

        // Coordinator oversight
        if (senderRole === "coordinator" || recipientRole === "coordinator") {
          return true;
        }

        return false;
      }

      case "peer_to_peer":
        // Full cross-role communication
        return true;

      case "specialist_pool":
        // Coordinator <-> Specialist communication
        if (senderRole === "coordinator" || recipientRole === "coordinator") {
          return true;
        }
        return false;

      default:
        return true;
    }
  }

  /**
   * Evaluate whether a task handoff is permitted between roles under the team topology.
   */
  public isHandoffPermitted(
    team: TeamDefinition,
    sourceRole: TeamRole,
    targetRole: TeamRole
  ): boolean {
    switch (team.topology) {
      case "coordinator_workers":
        if (sourceRole === "coordinator" || targetRole === "coordinator") {
          return true;
        }
        return team.communicationPolicy.allowDirectPeerMessages ?? true;

      case "pipeline": {
        const sourceIdx = PIPELINE_ORDER[sourceRole];
        const targetIdx = PIPELINE_ORDER[targetRole];
        if (sourceIdx === undefined || targetIdx === undefined) return false;

        // Forward pipeline handoff (step i -> step i+1)
        if (targetIdx === sourceIdx + 1) return true;

        // Rejection / rework handoff back to implementer
        if (targetRole === "implementer" && (sourceRole === "reviewer" || sourceRole === "verifier")) {
          return true;
        }

        return false;
      }

      case "peer_to_peer":
        return true;

      case "specialist_pool":
        return sourceRole === "coordinator" || targetRole === "coordinator";

      default:
        return true;
    }
  }
}
