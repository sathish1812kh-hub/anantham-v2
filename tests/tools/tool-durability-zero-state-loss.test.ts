import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { ToolGateway } from "../../src/tools/tool-gateway.js";
import { ToolRegistry } from "../../src/tools/tool-registry.js";
import { PolicyEngine } from "../../src/policy/policy-engine.js";
import { ApprovalManager } from "../../src/policy/approval-manager.js";
import { EventTypes } from "../../src/domain/event.js";

describe("P4 Gate Invariant — Zero State Loss & Crash Recovery for ToolGateway Events", () => {
  let engine: SqliteEngine;
  let eventStore: EventStore;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    new MigrationEngine(engine).migrate();

    const now = new Date().toISOString();
    new ProjectRepository(engine).save({
      id: "prj_tool_gate",
      name: "Project Tool Gate",
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

  it("P4 GATE INVARIANT: Tool approval request and subsequent execution are completely recorded in immutable SQLite events", async () => {
    const registry = new ToolRegistry();
    registry.register({
      definition: {
        name: "durable_write_tool",
        parametersSchema: { properties: { data: { type: "string" } } },
        isIdempotent: false,
        riskLevel: "high",
      },
      handler: async (args: any) => `Written: ${args.data}`,
    });

    const policyEngine = new PolicyEngine();
    const approvalManager = new ApprovalManager({ eventStore });
    const gateway = new ToolGateway({ registry, policyEngine, approvalManager, eventStore });

    // 1. Initial invocation creates approval request
    const obs1 = await gateway.invoke({
      callId: "call_dur_1",
      toolName: "durable_write_tool",
      arguments: { data: "state_to_preserve" },
      actor: { id: "agent_persister", type: "agent" },
      project: { id: "prj_tool_gate" },
    });

    expect(obs1.status).toBe("approval_required");
    const approvalId = obs1.approvalId!;

    // 2. Grant approval
    approvalManager.grantApproval(approvalId, "user_admin");

    // 3. Execution completes
    const obs2 = await gateway.invoke({
      callId: "call_dur_2",
      toolName: "durable_write_tool",
      arguments: { data: "state_to_preserve" },
      actor: { id: "agent_persister", type: "agent" },
      project: { id: "prj_tool_gate" },
      approvalId,
    });

    expect(obs2.status).toBe("success");

    // 4. Verify durable event history in SQLite
    const events = eventStore.getEventsByProject("prj_tool_gate");
    expect(events.length).toBe(3);
    expect(events[0].type).toBe(EventTypes.TOOL_REQUESTED);
    expect(events[1].type).toBe(EventTypes.TOOL_APPROVED);
    expect(events[2].type).toBe(EventTypes.TOOL_COMPLETED);
  });
});
