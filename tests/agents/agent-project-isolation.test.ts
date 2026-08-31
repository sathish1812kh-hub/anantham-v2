import { describe, it, expect } from "vitest";
import { AgentManager } from "../../src/agents/agent-manager.js";
import { AgentManifest } from "../../src/domain/agent.js";

describe("P6.1 Agents — Project Isolation", () => {
  it("blocks startup resolution when requested from an unauthorized project context", () => {
    const manager = new AgentManager();
    const manifest: AgentManifest = {
      id: "project-a-agent",
      name: "Project A Agent",
      version: "1.0.0",
      role: "Worker",
      objective: "Work on Project A",
      modelProfile: "fast",
      requiredCapabilities: [],
      tools: [],
      skills: [],
      permissionProfile: "developer",
      executorProfile: "local",
      budget: {},
      contextScope: { includeMemory: true },
      scope: "project",
      projectId: "project_alpha",
    };

    manager.register(manifest);

    // Resolving from project_beta must fail
    const result = manager.resolveStartup("project-a-agent", {
      projectId: "project_beta",
      sessionId: "sess_beta",
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("PROJECT_ISOLATION_VIOLATION");
  });
});
