import { describe, it, expect } from "vitest";
import { PolicyEngine } from "../../src/policy/policy-engine.js";

describe("P4.1 Data Sensitivity Authorization & Anti-Downgrade Guards", () => {
  it("denies secret data access to non-user/non-system actors", () => {
    const engine = new PolicyEngine();

    const decision = engine.evaluate({
      actor: { id: "agent_analyst", type: "agent" },
      project: { id: "prj_main" },
      operation: { type: "read_content", resource: "auth_token_key" },
      dataSensitivity: "secret",
    });

    expect(decision.decision).toBe("deny");
    expect(decision.riskLevel).toBe("critical");
    expect(decision.reason).toContain("Raw credential or secret data access prohibited");
  });

  it("denies sensitive data access to unconfined MCP actors", () => {
    const engine = new PolicyEngine();

    const decision = engine.evaluate({
      actor: { id: "mcp_weather", type: "mcp" },
      project: { id: "prj_main" },
      operation: { type: "query_resource", resource: "user_database" },
      dataSensitivity: "sensitive",
    });

    expect(decision.decision).toBe("deny");
    expect(decision.riskLevel).toBe("high");
    expect(decision.reason).toContain("MCP actor is not authorized to access sensitive classified data");
  });

  it("allows normal/public data access to trusted agent actors", () => {
    const engine = new PolicyEngine();

    const decision = engine.evaluate({
      actor: { id: "agent_coder", type: "agent" },
      project: { id: "prj_main" },
      operation: { type: "read_file", toolName: "read_file", resource: "src/main.ts" },
      dataSensitivity: "public",
    });

    expect(decision.decision).toBe("allow");
    expect(decision.riskLevel).toBe("low");
  });
});
