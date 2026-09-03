/**
 * Subagent Handoff Protocol & Lineage Tracker
 * PRD-HANDOFF-001: Subagent Handoff Protocol
 */

import { randomUUID } from "node:crypto";

export interface HandoffPayload {
  handoffId: string;
  sourceAgentId: string;
  targetAgentId: string;
  sessionId: string;
  reason: string;
  transferredState: Record<string, unknown>;
  activeTaskIds: string[];
  lineage: string[]; // Ordered list of prior agent IDs
  timestamp: string;
  status: "initiated" | "acknowledged" | "rejected" | "completed";
}

export class SubagentHandoffProtocol {
  private activeHandoffs: Map<string, HandoffPayload> = new Map();

  public initiateHandoff(
    sourceAgentId: string,
    targetAgentId: string,
    sessionId: string,
    reason: string,
    transferredState: Record<string, unknown>,
    activeTaskIds: string[] = [],
    priorLineage: string[] = []
  ): HandoffPayload {
    const handoffId = `handoff_${randomUUID().slice(0, 8)}`;
    const payload: HandoffPayload = {
      handoffId,
      sourceAgentId,
      targetAgentId,
      sessionId,
      reason,
      transferredState,
      activeTaskIds,
      lineage: [...priorLineage, sourceAgentId],
      timestamp: new Date().toISOString(),
      status: "initiated",
    };

    this.activeHandoffs.set(handoffId, payload);
    return payload;
  }

  public acknowledgeHandoff(handoffId: string, targetAgentId: string): HandoffPayload {
    const handoff = this.activeHandoffs.get(handoffId);
    if (!handoff) {
      throw new Error(`Handoff with ID ${handoffId} not found`);
    }

    if (handoff.targetAgentId !== targetAgentId) {
      throw new Error(`Target agent ${targetAgentId} cannot acknowledge handoff intended for ${handoff.targetAgentId}`);
    }

    handoff.status = "acknowledged";
    return handoff;
  }

  public completeHandoff(handoffId: string): HandoffPayload {
    const handoff = this.activeHandoffs.get(handoffId);
    if (!handoff) {
      throw new Error(`Handoff with ID ${handoffId} not found`);
    }

    handoff.status = "completed";
    return handoff;
  }

  public getHandoff(handoffId: string): HandoffPayload | undefined {
    return this.activeHandoffs.get(handoffId);
  }
}
