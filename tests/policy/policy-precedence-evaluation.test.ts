import { describe, it, expect } from "vitest";
import { PolicyEngine } from "../../src/policy/policy-engine.js";

describe("P4.1 Policy Engine — Precedence Hierarchy Evaluation", () => {
  it("SYSTEM INVARIANT overrides permissive project rules: cross-project access denied", () => {
    const engine = new PolicyEngine({
      rules: [
        {
          ruleId: "allow_all_tools",
          name: "Permissive Rule",
          priority: 100,
          scope: {},
          effect: "allow",
          riskLevel: "low",
          reason: "Permissive project rule",
        },
      ],
    });

    const decision = engine.evaluate({
      actor: { id: "agent_rogue", type: "agent" },
      project: { id: "prj_primary" },
      operation: {
        type: "tool_execution",
        toolName: "read_file",
        targetProjectId: "prj_other",
      },
    });

    // Invariant (Precedence 1) wins over Rule (Precedence 2)
    expect(decision.decision).toBe("deny");
    expect(decision.riskLevel).toBe("critical");
    expect(decision.reason).toContain("Cross-project isolation breach");
  });

  it("POLICY RULES override default actor/risk fallbacks", () => {
    const engine = new PolicyEngine({
      rules: [
        {
          ruleId: "deny_shell_for_all",
          name: "Strict Shell Prohibition",
          priority: 50,
          scope: { toolName: "run_command" },
          effect: "deny",
          riskLevel: "high",
          reason: "No shell commands permitted in this project",
        },
      ],
    });

    const decision = engine.evaluate({
      actor: { id: "user_owner", type: "user" },
      project: { id: "prj_primary" },
      operation: {
        type: "tool_execution",
        toolName: "run_command",
        arguments: { command: "ls -la" },
      },
    });

    expect(decision.decision).toBe("deny");
    expect(decision.ruleId).toBe("deny_shell_for_all");
  });

  it("requires approval for autonomous agent HIGH risk operations by default", () => {
    const engine = new PolicyEngine();

    const decision = engine.evaluate({
      actor: { id: "agent_planner", type: "agent" },
      project: { id: "prj_primary" },
      operation: {
        type: "tool_execution",
        toolName: "run_command",
        arguments: { command: "npm test" },
      },
    });

    expect(decision.decision).toBe("require_approval");
    expect(decision.riskLevel).toBe("high");
  });

  it("fails closed on malformed context payload", () => {
    const engine = new PolicyEngine();

    const decision = engine.evaluate({
      actor: { id: "", type: "unknown_type" as any },
      project: { id: "" },
      operation: { type: "" },
    });

    expect(decision.decision).toBe("deny");
    expect(decision.reason).toContain("Fail-closed");
  });
});
