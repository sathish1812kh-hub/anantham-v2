import { describe, it, expect, beforeEach } from "vitest";
import { PolicyEngine } from "../../src/policy/policy-engine.js";
import { ToolGateway } from "../../src/tools/tool-gateway.js";
import { ToolRegistry } from "../../src/tools/tool-registry.js";
import { SecurityEventClassifier } from "../../src/observability/security-event-classifier.js";

describe("P9.3 Security — Tool Policy Bypass & Path Traversal Adversarial Hardening", () => {
  let policyEngine: PolicyEngine;
  let toolRegistry: ToolRegistry;
  let toolGateway: ToolGateway;

  beforeEach(() => {
    policyEngine = new PolicyEngine();
    toolRegistry = new ToolRegistry();
    toolGateway = new ToolGateway(toolRegistry, policyEngine);

    toolRegistry.register({
      definition: {
        name: "read_file",
        description: "Reads file from workspace",
        riskLevel: "low",
        category: "filesystem",
        parametersSchema: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
      handler: async (args: any) => ({ content: `Content of ${args.path}` }),
    });

    toolRegistry.register({
      definition: {
        name: "delete_file",
        description: "Deletes file from workspace",
        riskLevel: "high",
        category: "filesystem",
        parametersSchema: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
      handler: async (args: any) => ({ deleted: true }),
    });
  });

  it("blocks path traversal escape outside workspace boundary", async () => {
    const traversalPaths = [
      "../../../../etc/passwd",
      "..\\..\\..\\Windows\\System32\\config\\SAM",
      "/var/run/secrets/kubernetes.io/serviceaccount/token",
      "C:\\Windows\\System32\\cmd.exe",
    ];

    for (const p of traversalPaths) {
      const decision = policyEngine.evaluate({
        actor: { id: "agent_01", type: "agent" },
        project: { id: "proj_01", trustProfile: "safe" },
        operation: {
          type: "file_read",
          toolName: "read_file",
          resource: p,
          targetProjectId: "proj_foreign", // cross-project escape attempt
          arguments: { path: p },
        },
      });

      expect(decision.decision).toBe("deny");

      const classification = SecurityEventClassifier.classify(
        { type: "tool.execution_attempt" },
        decision.decision,
        decision.reason || "Cross-project tenant boundary path traversal violation"
      );
      expect(classification).toBe("PROJECT_ISOLATION_VIOLATION");
    }
  });

  it("requires approval for high risk delete tools on autonomous agent", async () => {
    const decision = policyEngine.evaluate({
      actor: { id: "agent_01", type: "agent" },
      project: { id: "proj_01", trustProfile: "safe" },
      operation: {
        type: "file_delete",
        toolName: "delete_file",
        resource: "important.db",
        arguments: { path: "important.db" },
      },
    });

    // High risk autonomous agent execution requires approval
    expect(decision.decision).toBe("require_approval");
    expect(decision.riskLevel).toBe("high");
  });
});
