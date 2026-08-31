import { describe, it, expect } from "vitest";
import { AgentStartupResolver } from "../../src/agents/agent-startup-resolver.js";
import { AgentManifest } from "../../src/domain/agent.js";
import { ModelRouter } from "../../src/models/model-router.js";
import { MockProviderAdapter } from "../../src/models/mock-provider-adapter.js";
import { CLAUDE_3_5_SONNET_PROFILE } from "../../src/models/capability-profiles.js";

describe("P6.1 Agents — Model & Capability Matching", () => {
  it("resolves model profile and capabilities using ModelRouter", () => {
    const router = new ModelRouter();
    router.registerCandidate(
      {
        modelId: "claude-3-5-sonnet-20241022",
        providerId: "anthropic",
        profile: CLAUDE_3_5_SONNET_PROFILE,
        priority: 10,
      },
      new MockProviderAdapter({ providerId: "anthropic" })
    );

    const resolver = new AgentStartupResolver({ modelRouter: router });

    const manifest: AgentManifest = {
      id: "vision-agent",
      name: "Vision Agent",
      version: "1.0.0",
      role: "Image Analyzer",
      objective: "Analyze visual diagrams",
      modelProfile: "claude-3-5-sonnet-20241022",
      requiredCapabilities: ["tool_calling"],
      tools: [],
      skills: [],
      permissionProfile: "developer",
      executorProfile: "local",
      budget: {},
      contextScope: { includeMemory: true },
      scope: "global",
    };

    const result = resolver.resolve(manifest, {
      projectId: "proj_v",
      sessionId: "sess_v",
    });

    expect(result.success).toBe(true);
    expect(result.startupPlan?.resolvedModel.modelId).toBe("claude-3-5-sonnet-20241022");
    expect(result.startupPlan?.resolvedModel.provider).toBe("anthropic");
  });

  it("fails startup when requested model profile cannot be resolved", () => {
    const resolver = new AgentStartupResolver();
    const manifest: AgentManifest = {
      id: "broken-agent",
      name: "Broken Agent",
      version: "1.0.0",
      role: "Broken",
      objective: "Should fail",
      modelProfile: "unsupported_profile",
      requiredCapabilities: ["quantum_compute"],
      tools: [],
      skills: [],
      permissionProfile: "developer",
      executorProfile: "local",
      budget: {},
      contextScope: { includeMemory: true },
      scope: "global",
    };

    const result = resolver.resolve(manifest, {
      projectId: "proj_err",
      sessionId: "sess_err",
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("MODEL_UNRESOLVABLE");
  });
});
