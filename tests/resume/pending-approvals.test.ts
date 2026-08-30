import { describe, it, expect } from "vitest";
import { PendingApprovalRestorer } from "../../src/resume/pending-approval-restorer.js";
import type { HarnessEvent } from "../../src/domain/event.js";

describe("P1.5 Resume Subsystem — Pending Approval Restorer", () => {
  it("restores active pending approvals from event stream", () => {
    const events: HarnessEvent[] = [
      {
        id: "evt_app_01",
        schemaVersion: 1,
        projectId: "proj_1",
        sessionId: "sess_1",
        taskId: "task_1",
        type: "tool.approval.requested",
        actor: "agent",
        agentId: "agent_worker",
        payload: {
          approvalId: "app_req_01",
          toolName: "filesystem:write",
          riskLevel: "high",
          toolArgs: { path: "src/critical.ts" },
        },
        timestamp: "2026-08-30T21:00:00.000Z",
      },
      {
        id: "evt_app_02",
        schemaVersion: 1,
        projectId: "proj_1",
        sessionId: "sess_1",
        taskId: "task_2",
        type: "approval.requested",
        actor: "agent",
        agentId: "agent_worker",
        payload: {
          approvalId: "app_req_02",
          action: "shell:execute",
          riskLevel: "critical",
          toolArgs: { cmd: "rm -rf build/" },
        },
        timestamp: "2026-08-30T21:01:00.000Z",
      },
      {
        id: "evt_app_03",
        schemaVersion: 1,
        projectId: "proj_1",
        sessionId: "sess_1",
        taskId: "task_1",
        type: "tool.approval.granted",
        actor: "user",
        payload: {
          approvalId: "app_req_01",
        },
        timestamp: "2026-08-30T21:02:00.000Z",
      },
    ];

    const result = PendingApprovalRestorer.restorePendingApprovals(events);

    expect(result.pendingApprovalsCount).toBe(1);
    expect(result.approvals[0].approvalId).toBe("app_req_02");
    expect(result.approvals[0].action).toBe("shell:execute");
    expect(result.approvals[0].riskLevel).toBe("critical");
  });

  it("filters out expired approvals when expiresAt is in the past", () => {
    const events: HarnessEvent[] = [
      {
        id: "evt_exp_01",
        schemaVersion: 1,
        projectId: "proj_1",
        sessionId: "sess_1",
        taskId: "task_1",
        type: "approval.requested",
        actor: "agent",
        payload: {
          approvalId: "app_expired",
          action: "git:push",
          riskLevel: "medium",
          expiresAt: "2026-08-30T20:00:00.000Z", // Expired
        },
        timestamp: "2026-08-30T19:50:00.000Z",
      },
    ];

    const nowMs = new Date("2026-08-30T21:00:00.000Z").getTime();
    const result = PendingApprovalRestorer.restorePendingApprovals(events, { nowMs });

    expect(result.pendingApprovalsCount).toBe(0);
    expect(result.approvals).toHaveLength(0);
  });
});
