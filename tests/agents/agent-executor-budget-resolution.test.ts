import { describe, it, expect } from "vitest";
import { AgentStartupResolver } from "../../src/agents/agent-startup-resolver.js";
import { AgentManifest } from "../../src/domain/agent.js";

describe("P6.1 Agents — Executor & Budget Resolution", () => {
  it("resolves docker executor as sandboxed", () => {
    const resolver = new AgentStartupResolver();
    const manifest: AgentManifest = {
      id: "sandbox-agent",
      name: "Sandbox Agent",
      version: "1.0.0",
      role: "Sandbox Worker",
      objective: "Execute untrusted code",
      modelProfile: "fast",
      requiredCapabilities: [],
      tools: [],
      skills: [],
      permissionProfile: "developer",
      executorProfile: "docker",
      budget: { maxTokens: 25000, maxCostUsd: 1.0 },
      contextScope: { includeMemory: true },
      scope: "global",
    };

    const result = resolver.resolve(manifest, {
      projectId: "proj_exec",
      sessionId: "sess_exec",
    });

    expect(result.success).toBe(true);
    expect(result.startupPlan?.executor.type).toBe("docker");
    expect(result.startupPlan?.executor.isSandboxed).toBe(true);
    expect(result.startupPlan?.budget.maxTokens).toBe(25000);
    expect(result.startupPlan?.budget.maxCostUsd).toBe(1.0);
  });
});
