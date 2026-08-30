import type { HarnessEvent } from "../domain/event.js";
import type { PendingApprovalItem, RestoredPendingApprovals } from "./resume-contract.js";

export class PendingApprovalRestorer {
  /**
   * Reconstructs active pending approvals from the immutable event log.
   * PRD Part 1 Section 56-57 & PRD Part 3 Section 146.
   */
  public static restorePendingApprovals(
    events: Readonly<HarnessEvent>[],
    options?: { nowMs?: number }
  ): RestoredPendingApprovals {
    const now = options?.nowMs ?? Date.now();
    const pendingMap = new Map<string, PendingApprovalItem>();

    for (const event of events) {
      const type = event.type;
      const payload = event.payload || {};

      if (type === "approval.requested" || type === "tool.approval.requested") {
        const approvalId = String(payload.approvalId || `app_${event.id}`);
        const taskId = String(event.taskId || payload.taskId || "task_unspecified");
        const action = String(payload.action || payload.toolName || "tool_execution");
        const riskLevel = (payload.riskLevel as any) || "medium";
        const requestedBy = String(event.agentId || payload.requestedBy || "agent");
        const expiresAt = payload.expiresAt ? String(payload.expiresAt) : undefined;

        pendingMap.set(approvalId, {
          approvalId,
          taskId,
          action,
          riskLevel,
          requestedBy,
          createdAt: event.timestamp,
          expiresAt,
          payload: (payload.toolArgs as Record<string, unknown>) || payload,
        });
      } else if (
        type === "approval.granted" ||
        type === "approval.rejected" ||
        type === "approval.cancelled" ||
        type === "tool.approval.granted" ||
        type === "tool.approval.rejected"
      ) {
        const approvalId = String(payload.approvalId || "");
        if (approvalId) {
          pendingMap.delete(approvalId);
        }
      }
    }

    // Filter out expired approvals
    const validApprovals: PendingApprovalItem[] = [];
    for (const item of pendingMap.values()) {
      if (item.expiresAt) {
        const expiryTime = new Date(item.expiresAt).getTime();
        if (!isNaN(expiryTime) && expiryTime <= now) {
          continue; // Expired
        }
      }
      validApprovals.push(item);
    }

    return {
      pendingApprovalsCount: validApprovals.length,
      approvals: validApprovals,
    };
  }
}
