import { describe, it, expect } from "vitest";
import { AuditLogger } from "../../src/observability/audit-logger.js";
import { type HarnessEvent } from "../../src/domain/event.js";

describe("P8.5 Observability — Correlation & Causality Tracking", () => {
  it("preserves unbroken lineage from root request down to tool execution", () => {
    const logger = new AuditLogger();
    const correlationId = "corr_req_12345";

    // 1. Root User Request
    const rootEvent: Partial<HarnessEvent> = {
      id: "evt_root_01",
      correlationId,
      projectId: "proj_causality",
      type: "session.started",
      actor: "user",
    };
    const rec1 = logger.record({
      event: rootEvent,
      actor: "user",
      action: "session.started",
      classification: "INFORMATIONAL",
      decision: "PERMIT",
      reasonCode: "SESSION_INIT",
    });

    // 2. Task Created (Child of root event)
    const taskEvent: Partial<HarnessEvent> = {
      id: "evt_task_01",
      correlationId,
      parentEventId: "evt_root_01",
      projectId: "proj_causality",
      type: "task.created",
      actor: "agent",
    };
    const rec2 = logger.record({
      event: taskEvent,
      actor: "agent",
      action: "task.created",
      classification: "INFORMATIONAL",
      decision: "PERMIT",
      reasonCode: "TASK_CREATED",
    });

    // 3. Tool Requested (Child of task event)
    const toolEvent: Partial<HarnessEvent> = {
      id: "evt_tool_01",
      correlationId,
      parentEventId: "evt_task_01",
      projectId: "proj_causality",
      type: "tool.requested",
      actor: "agent",
    };
    const rec3 = logger.record({
      event: toolEvent,
      actor: "agent",
      action: "tool.requested",
      classification: "INFORMATIONAL",
      decision: "PERMIT",
      reasonCode: "TOOL_CALL",
    });

    // Verify correlation ID is unified across entire lineage
    const records = logger.query({ projectId: "proj_causality" });
    expect(records.length).toBe(3);
    expect(records.every((r) => r.correlationId === correlationId)).toBe(true);

    // Verify parentEventId establishes unbroken causality chain
    expect(rec2.parentEventId).toBe("evt_root_01");
    expect(rec3.parentEventId).toBe("evt_task_01");
  });
});
