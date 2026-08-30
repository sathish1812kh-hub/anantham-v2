import { createHash } from "node:crypto";
import {
  type ApprovalRecord,
  type PolicyEvaluationContext,
  type RiskLevel,
  ApprovalRecordSchema,
} from "../domain/policy.js";
import { type EventStore } from "../event-state/event-store.js";
import { EventTypes, type HarnessEvent } from "../domain/event.js";

export interface ApprovalManagerOptions {
  eventStore?: EventStore;
  defaultTtlMs?: number;
}

export class ApprovalManager {
  private readonly approvals = new Map<string, ApprovalRecord>();
  private readonly eventStore?: EventStore;
  private readonly defaultTtlMs: number;

  constructor(options: ApprovalManagerOptions = {}) {
    this.eventStore = options.eventStore;
    this.defaultTtlMs = options.defaultTtlMs || 30 * 60 * 1000; // 30 mins
  }

  /**
   * Computes a deterministic SHA-256 canonical digest of the operation and context to prevent TOCTOU tampering.
   * PRD Part 3 Section 146.
   */
  private static canonicalize(val: unknown): unknown {
    if (val === null || typeof val !== "object") return val;
    if (Array.isArray(val)) return val.map(ApprovalManager.canonicalize);
    const sortedObj: Record<string, unknown> = {};
    for (const key of Object.keys(val).sort()) {
      sortedObj[key] = ApprovalManager.canonicalize((val as Record<string, unknown>)[key]);
    }
    return sortedObj;
  }

  public static computeArgumentsDigest(
    context: PolicyEvaluationContext,
    policyVersion: string = "1.0.0"
  ): string {
    const canonicalObject = {
      actorId: context.actor.id,
      actorType: context.actor.type,
      projectId: context.project.id,
      action: context.operation.toolName || context.operation.type,
      resource: context.operation.resource || "",
      arguments: context.operation.arguments || {},
      targetProjectId: context.operation.targetProjectId || context.project.id,
      dataSensitivity: context.dataSensitivity || "normal",
      policyVersion,
    };

    const serialized = JSON.stringify(ApprovalManager.canonicalize(canonicalObject));
    return createHash("sha256").update(serialized).digest("hex");
  }

  public createApprovalRequest(
    context: PolicyEvaluationContext,
    riskLevel: RiskLevel,
    options: { expiresAt?: string; approvalId?: string; policyVersion?: string } = {}
  ): ApprovalRecord {
    const approvalId = options.approvalId || `app_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date();
    const policyVersion = options.policyVersion || "1.0.0";
    const expiresAt = options.expiresAt || new Date(now.getTime() + this.defaultTtlMs).toISOString();
    const argumentsDigest = ApprovalManager.computeArgumentsDigest(context, policyVersion);
    const action = context.operation.toolName || context.operation.type;

    const record: ApprovalRecord = ApprovalRecordSchema.parse({
      approvalId,
      projectId: context.project.id,
      sessionId: context.session?.id,
      taskId: context.task?.id,
      actorId: context.actor.id,
      action,
      riskLevel,
      argumentsDigest,
      status: "pending",
      createdAt: now.toISOString(),
      expiresAt,
      policyVersion,
    });

    this.approvals.set(approvalId, record);

    if (this.eventStore) {
      this.eventStore.append({
        id: `evt_app_req_${approvalId}`,
        schemaVersion: 1,
        projectId: context.project.id,
        sessionId: context.session?.id,
        taskId: context.task?.id,
        type: EventTypes.TOOL_REQUESTED,
        actor: context.actor.type,
        timestamp: now.toISOString(),
        payload: {
          approvalId,
          action,
          riskLevel,
          argumentsDigest,
          expiresAt,
          policyVersion,
          toolArgs: context.operation.arguments,
        },
      });
    }

    return record;
  }

  public getApproval(approvalId: string): ApprovalRecord | undefined {
    const record = this.approvals.get(approvalId);
    if (!record) return undefined;

    // Check expiration
    if (record.status === "pending" && record.expiresAt) {
      if (new Date(record.expiresAt).getTime() <= Date.now()) {
        const expired = { ...record, status: "expired" as const };
        this.approvals.set(approvalId, expired);
        return expired;
      }
    }
    return record;
  }

  public grantApproval(
    approvalId: string,
    approverActorId: string,
    options: { reason?: string } = {}
  ): ApprovalRecord {
    const record = this.getApproval(approvalId);
    if (!record) {
      throw new Error(`Approval request "${approvalId}" not found.`);
    }

    if (record.status === "expired") {
      throw new Error(`Approval request "${approvalId}" has expired.`);
    }

    if (record.status !== "pending") {
      throw new Error(`Cannot grant approval "${approvalId}" in status "${record.status}".`);
    }

    const now = new Date().toISOString();
    const updated: ApprovalRecord = {
      ...record,
      status: "approved",
      decidedAt: now,
      decidedBy: approverActorId,
      decisionReason: options.reason || "Approved by authorized human operator",
    };

    this.approvals.set(approvalId, updated);

    if (this.eventStore) {
      this.eventStore.append({
        id: `evt_app_grant_${approvalId}_${Date.now()}`,
        schemaVersion: 1,
        projectId: record.projectId,
        sessionId: record.sessionId,
        taskId: record.taskId,
        type: EventTypes.TOOL_APPROVED,
        actor: "user",
        timestamp: now,
        payload: {
          approvalId,
          decidedBy: approverActorId,
          reason: updated.decisionReason,
        },
      });
    }

    return updated;
  }

  public rejectApproval(
    approvalId: string,
    approverActorId: string,
    options: { reason?: string } = {}
  ): ApprovalRecord {
    const record = this.getApproval(approvalId);
    if (!record) {
      throw new Error(`Approval request "${approvalId}" not found.`);
    }

    if (record.status !== "pending") {
      throw new Error(`Cannot reject approval "${approvalId}" in status "${record.status}".`);
    }

    const now = new Date().toISOString();
    const updated: ApprovalRecord = {
      ...record,
      status: "rejected",
      decidedAt: now,
      decidedBy: approverActorId,
      decisionReason: options.reason || "Rejected by authorized human operator",
    };

    this.approvals.set(approvalId, updated);

    if (this.eventStore) {
      this.eventStore.append({
        id: `evt_app_rej_${approvalId}_${Date.now()}`,
        schemaVersion: 1,
        projectId: record.projectId,
        sessionId: record.sessionId,
        taskId: record.taskId,
        type: EventTypes.TOOL_DENIED,
        actor: "user",
        timestamp: now,
        payload: {
          approvalId,
          decidedBy: approverActorId,
          reason: updated.decisionReason,
        },
      });
    }

    return updated;
  }

  public cancelApproval(approvalId: string, cancellerActorId: string, reason?: string): ApprovalRecord {
    const record = this.getApproval(approvalId);
    if (!record) {
      throw new Error(`Approval request "${approvalId}" not found.`);
    }

    if (record.status !== "pending") {
      throw new Error(`Cannot cancel approval "${approvalId}" in status "${record.status}".`);
    }

    const now = new Date().toISOString();
    const updated: ApprovalRecord = {
      ...record,
      status: "cancelled",
      decidedAt: now,
      decidedBy: cancellerActorId,
      decisionReason: reason || "Cancelled by caller",
    };

    this.approvals.set(approvalId, updated);
    return updated;
  }

  /**
   * Revalidates approval at the execution boundary against TOCTOU argument tampering, expiration, and policy shifts.
   * PRD Part 3 Section 146.
   */
  public validateAndConsumeApproval(
    approvalId: string,
    executionContext: PolicyEvaluationContext,
    currentPolicyVersion: string = "1.0.0"
  ): { valid: boolean; reason?: string } {
    const record = this.getApproval(approvalId);
    if (!record) {
      return { valid: false, reason: `Approval request "${approvalId}" does not exist.` };
    }

    if (record.status !== "approved") {
      return { valid: false, reason: `Approval "${approvalId}" is not in approved state (status: "${record.status}").` };
    }

    // 1. Expiration check
    if (record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()) {
      return { valid: false, reason: `Approval "${approvalId}" expired before execution.` };
    }

    // 2. Policy version consistency check
    if (currentPolicyVersion !== record.policyVersion) {
      return {
        valid: false,
        reason: `Policy version drift detected: Approved under version "${record.policyVersion}", but current active policy is "${currentPolicyVersion}". Re-approval required.`,
      };
    }

    // 3. TOCTOU Digest match check
    const currentDigest = ApprovalManager.computeArgumentsDigest(executionContext, currentPolicyVersion);
    if (currentDigest !== record.argumentsDigest) {
      return {
        valid: false,
        reason: `TOCTOU violation detected: Execution arguments, target project, or context modified after approval was granted.`,
      };
    }

    return { valid: true };
  }

  /**
   * Restores approval state deterministically from the immutable event log.
   */
  public restoreFromEvents(events: Readonly<HarnessEvent>[]): void {
    this.approvals.clear();
    for (const event of events) {
      const type = event.type;
      const payload = event.payload || {};

      if (type === EventTypes.TOOL_REQUESTED || type === "approval.requested") {
        const approvalId = String(payload.approvalId || `app_${event.id}`);
        this.approvals.set(approvalId, {
          approvalId,
          projectId: event.projectId || "default",
          sessionId: event.sessionId,
          taskId: event.taskId,
          actorId: String(payload.actorId || event.actor || "agent"),
          action: String(payload.action || payload.toolName || "tool_execution"),
          riskLevel: (payload.riskLevel as any) || "medium",
          argumentsDigest: String(payload.argumentsDigest || ""),
          status: "pending",
          createdAt: event.timestamp,
          expiresAt: payload.expiresAt ? String(payload.expiresAt) : undefined,
          policyVersion: String(payload.policyVersion || "1.0.0"),
        });
      } else if (type === EventTypes.TOOL_APPROVED || type === "approval.granted") {
        const approvalId = String(payload.approvalId || "");
        const existing = this.approvals.get(approvalId);
        if (existing) {
          existing.status = "approved";
          existing.decidedAt = event.timestamp;
          existing.decidedBy = String(payload.decidedBy || event.actor);
          existing.decisionReason = payload.reason ? String(payload.reason) : undefined;
        }
      } else if (type === EventTypes.TOOL_DENIED || type === "approval.rejected") {
        const approvalId = String(payload.approvalId || "");
        const existing = this.approvals.get(approvalId);
        if (existing) {
          existing.status = "rejected";
          existing.decidedAt = event.timestamp;
          existing.decidedBy = String(payload.decidedBy || event.actor);
          existing.decisionReason = payload.reason ? String(payload.reason) : undefined;
        }
      }
    }
  }
}
