import { describe, it, expect } from "vitest";
import { SubagentHandoffProtocol } from "../../src/agents/subagent-handoff-protocol.js";

describe("PRD-HANDOFF-001: Subagent Handoff Protocol", () => {
  const protocol = new SubagentHandoffProtocol();

  it("initiates, tracks lineage, acknowledges, and completes subagent handoff", () => {
    const handoff = protocol.initiateHandoff(
      "planner_agent",
      "coder_agent",
      "sess_m4",
      "Plan completed, handoff to coder for implementation",
      { currentPhase: "M4", activeFile: "src/cli/interactive-shell.ts" },
      ["task_48", "task_49"],
      ["root_orchestrator"]
    );

    expect(handoff.handoffId).toBeDefined();
    expect(handoff.status).toBe("initiated");
    expect(handoff.sourceAgentId).toBe("planner_agent");
    expect(handoff.targetAgentId).toBe("coder_agent");
    expect(handoff.lineage).toEqual(["root_orchestrator", "planner_agent"]);
    expect(handoff.activeTaskIds).toContain("task_48");

    // Target agent acknowledges handoff
    const ack = protocol.acknowledgeHandoff(handoff.handoffId, "coder_agent");
    expect(ack.status).toBe("acknowledged");

    // Completion
    const completed = protocol.completeHandoff(handoff.handoffId);
    expect(completed.status).toBe("completed");
  });

  it("rejects acknowledgment from wrong agent ID", () => {
    const handoff = protocol.initiateHandoff(
      "agent_A",
      "agent_B",
      "sess_1",
      "transfer",
      {}
    );

    expect(() => protocol.acknowledgeHandoff(handoff.handoffId, "agent_WRONG")).toThrow(
      "cannot acknowledge handoff intended for"
    );
  });
});
