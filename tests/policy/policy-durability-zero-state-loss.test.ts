import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { ApprovalManager } from "../../src/policy/approval-manager.js";

import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";

describe("P4 Gate Invariant — Zero State Loss & Crash Reconstruction for Policy Approvals", () => {
  let engine: SqliteEngine;
  let eventStore: EventStore;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    new MigrationEngine(engine).migrate();

    const now = new Date().toISOString();
    new ProjectRepository(engine).save({
      id: "prj_durable_policy",
      name: "Project Durable Policy",
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

  it("P4 GATE INVARIANT: Reconstructs approval state accurately after process crash/restart from SQLite events", () => {
    // 1. Session 1: Manager creates and grants approval
    const manager1 = new ApprovalManager({ eventStore });
    const context = {
      actor: { id: "agent_primary", type: "agent" as const },
      project: { id: "prj_durable_policy" },
      operation: {
        type: "tool_execution",
        toolName: "run_command",
        arguments: { script: "build.sh" },
      },
    };

    const req = manager1.createApprovalRequest(context, "high");
    manager1.grantApproval(req.approvalId, "user_alice", { reason: "Approved build" });

    // 2. Simulate complete process restart: instantiate brand-new ApprovalManager and restore from eventStore
    const manager2 = new ApprovalManager();
    const allEvents = eventStore.getEventsByProject("prj_durable_policy");
    manager2.restoreFromEvents(allEvents);

    // 3. Verify reconstructed state matches exactly
    const restored = manager2.getApproval(req.approvalId);
    expect(restored).toBeDefined();
    expect(restored?.status).toBe("approved");
    expect(restored?.decidedBy).toBe("user_alice");
    expect(restored?.decisionReason).toBe("Approved build");

    // 4. Execution revalidation passes on restored manager
    const reval = manager2.validateAndConsumeApproval(req.approvalId, context);
    expect(reval.valid).toBe(true);
  });
});
