import { describe, it, expect } from "vitest";
import { PolicyEngine } from "../../src/policy/policy-engine.js";

describe("P4.1 Project Isolation — Cross-Project Security Boundary", () => {
  it("strictly denies cross-project file read/write operations", () => {
    const engine = new PolicyEngine();

    const decision = engine.evaluate({
      actor: { id: "agent_project_a", type: "agent" },
      project: { id: "prj_tenant_alpha" },
      operation: {
        type: "tool_execution",
        toolName: "write_to_file",
        targetProjectId: "prj_tenant_beta",
        arguments: { path: "confidential.txt", content: "data" },
      },
    });

    expect(decision.decision).toBe("deny");
    expect(decision.riskLevel).toBe("critical");
    expect(decision.reason).toContain('Actor from project "prj_tenant_alpha" attempted unauthorized access to project "prj_tenant_beta"');
  });

  it("permits operations strictly scoped to the same project", () => {
    const engine = new PolicyEngine();

    const decision = engine.evaluate({
      actor: { id: "agent_project_a", type: "agent" },
      project: { id: "prj_tenant_alpha" },
      operation: {
        type: "tool_execution",
        toolName: "read_file",
        targetProjectId: "prj_tenant_alpha",
        resource: "README.md",
      },
    });

    expect(decision.decision).toBe("allow");
    expect(decision.riskLevel).toBe("low");
  });
});
