import { describe, it, expect, beforeEach } from "vitest";
import { AuditLogger } from "../../src/observability/audit-logger.js";
import { type HarnessEvent } from "../../src/domain/event.js";

describe("P8.5 Observability — Audit Logger & Cryptographic Tamper Evidence", () => {
  let logger: AuditLogger;

  beforeEach(() => {
    logger = new AuditLogger();
  });

  it("builds cryptographically chained audit records and validates clean integrity", () => {
    const event1: Partial<HarnessEvent> = {
      id: "evt_01",
      projectId: "proj_01",
      type: "tool.requested",
      actor: "agent",
      payload: { tool: "fs.read", path: "/src/index.ts" },
    };

    const event2: Partial<HarnessEvent> = {
      id: "evt_02",
      projectId: "proj_01",
      type: "tool.approved",
      actor: "user",
      payload: { tool: "fs.read" },
    };

    const rec1 = logger.record({
      event: event1,
      actor: "agent",
      action: "tool.requested",
      classification: "INFORMATIONAL",
      decision: "MONITOR",
      reasonCode: "TOOL_REQUEST_AUDIT",
    });

    const rec2 = logger.record({
      event: event2,
      actor: "user",
      action: "tool.approved",
      classification: "INFORMATIONAL",
      decision: "PERMIT",
      reasonCode: "HUMAN_APPROVAL_GRANTED",
    });

    expect(rec2.previousRecordDigest).toBe(rec1.recordDigest);

    const verification = AuditLogger.verifyChain(logger.getAllRecords());
    expect(verification.valid).toBe(true);
  });

  it("detects tampered audit record in historical chain", () => {
    logger.record({
      event: { id: "evt_10", projectId: "proj_01", type: "policy.evaluated" },
      actor: "system",
      action: "policy.evaluate",
      classification: "INFORMATIONAL",
      decision: "PERMIT",
      reasonCode: "POLICY_ALLOW",
    });

    logger.record({
      event: { id: "evt_11", projectId: "proj_01", type: "task.created" },
      actor: "user",
      action: "task.create",
      classification: "INFORMATIONAL",
      decision: "PERMIT",
      reasonCode: "TASK_CREATED",
    });

    const allRecords = logger.getAllRecords();
    // Tamper with decision of first record
    (allRecords[0] as any).decision = "DENY";

    const verification = AuditLogger.verifyChain(allRecords);
    expect(verification.valid).toBe(false);
    expect(verification.tamperedIndex).toBe(0);
    expect(verification.message).toContain("Record digest tampered");
  });
});
