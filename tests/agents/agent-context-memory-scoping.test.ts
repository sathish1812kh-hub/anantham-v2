import { describe, it, expect } from "vitest";
import { AgentStartupResolver } from "../../src/agents/agent-startup-resolver.js";
import { AgentManifest } from "../../src/domain/agent.js";

describe("P6.1 Agents — Context & Memory Scoping", () => {
  it("resolves context path constraints and isolated memory namespace", () => {
    const resolver = new AgentStartupResolver();
    const manifest: AgentManifest = {
      id: "docs-agent",
      name: "Docs Specialist",
      version: "1.0.0",
      role: "Documentation Writer",
      objective: "Write markdown documentation",
      modelProfile: "fast",
      requiredCapabilities: [],
      tools: [],
      skills: [],
      permissionProfile: "readonly",
      executorProfile: "local",
      budget: {},
      contextScope: {
        maxTokens: 16000,
        allowedPaths: ["docs/**/*", "README.md"],
        includeMemory: true,
      },
      memoryScope: {
        namespace: "docs:v1",
        readonly: false,
        crossProjectAccess: false,
      },
      scope: "project",
      projectId: "proj_docs",
    };

    const result = resolver.resolve(manifest, {
      projectId: "proj_docs",
      sessionId: "sess_docs",
    });

    expect(result.success).toBe(true);
    expect(result.startupPlan?.contextScope.maxTokens).toBe(16000);
    expect(result.startupPlan?.contextScope.allowedPaths).toEqual(["docs/**/*", "README.md"]);
    expect(result.startupPlan?.memoryScope.namespace).toBe("docs:v1");
  });
});
