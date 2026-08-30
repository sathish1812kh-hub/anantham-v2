import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { ApprovalManager } from "../../src/policy/approval-manager.js";
import { EventTypes } from "../../src/domain/event.js";

import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";

describe("P4.1 Policy & Approval Immutable Audit Logging", () => {
  let engine: SqliteEngine;
  let eventStore: EventStore;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    new MigrationEngine(engine).migrate();

    const now = new Date().toISOString();
    new ProjectRepository(engine).save({
      id: "prj_audit_test",
      name: "Project Audit Test",
      rootPath: "C:/work",
      status: "active",
      tags: [],
      modelProfile: "default",
      memoryNamespace: "default",
      orchestrationProfile: "default",
      trustProfile: "trusted",
      createdAt: now,
      lastOpenedAt: now,
      lastActivityAt: now,
    });

    eventStore = new EventStore(engine);
  });

  afterEach(() => {
    engine.close();
  });

  it("records append-only immutable events for approval request and grant", () => {
    const manager = new ApprovalManager({ eventStore });

    const context = {
      actor: { id: "agent_worker", type: "agent" as const },
      project: { id: "prj_audit_test" },
      operation: {
        type: "tool_execution",
        toolName: "run_command",
        arguments: { cmd: "deploy" },
      },
    };

    // 1. Request approval -> emits TOOL_REQUESTED event
    const req = manager.createApprovalRequest(context, "high");
    // 2. Grant approval -> emits TOOL_APPROVED event
    manager.grantApproval(req.approvalId, "user_supervisor", { reason: "Authorized deploy" });

    const events = eventStore.getEventsByProject("prj_audit_test");
    expect(events.length).toBe(2);
    expect(events[0].type).toBe(EventTypes.TOOL_REQUESTED);
    expect(events[1].type).toBe(EventTypes.TOOL_APPROVED);
    expect(events[1].payload.approvalId).toBe(req.approvalId);
    expect(events[1].payload.reason).toBe("Authorized deploy");
  });
});
