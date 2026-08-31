import { describe, it, expect } from "vitest";
import { AgentStartupResolver } from "../../src/agents/agent-startup-resolver.js";
import { AgentManifest } from "../../src/domain/agent.js";

describe("P6.1 Agents — Permission Resolution & Policy Gating", () => {
  it("grants developer permissions correctly", () => {
    const resolver = new AgentStartupResolver();
    const manifest: AgentManifest = {
      id: "dev-agent",
      name: "Dev Agent",
      version: "1.0.0",
      role: "Developer",
      objective: "Develop features",
      modelProfile: "reasoning",
      requiredCapabilities: [],
      tools: [],
      skills: [],
      permissionProfile: "developer",
      executorProfile: "local",
      budget: {},
      contextScope: { includeMemory: true },
      scope: "global",
    };

    const result = resolver.resolve(manifest, {
      projectId: "proj_perm",
      sessionId: "sess_perm",
    });

    expect(result.success).toBe(true);
    expect(result.startupPlan?.grantedPermissions).toContain("filesystem.read");
    expect(result.startupPlan?.grantedPermissions).toContain("filesystem.write");
    expect(result.startupPlan?.grantedPermissions).toContain("shell.execute");
  });

  it("restricts readonly profile to read-only permissions", () => {
    const resolver = new AgentStartupResolver();
    const manifest: AgentManifest = {
      id: "auditor-agent",
      name: "Auditor Agent",
      version: "1.0.0",
      role: "Auditor",
      objective: "Audit code safely",
      modelProfile: "fast",
      requiredCapabilities: [],
      tools: [],
      skills: [],
      permissionProfile: "readonly",
      executorProfile: "local",
      budget: {},
      contextScope: { includeMemory: true },
      scope: "global",
    };

    const result = resolver.resolve(manifest, {
      projectId: "proj_perm",
      sessionId: "sess_perm",
    });

    expect(result.success).toBe(true);
    expect(result.startupPlan?.grantedPermissions).toContain("filesystem.read");
    expect(result.startupPlan?.grantedPermissions).not.toContain("filesystem.write");
    expect(result.startupPlan?.grantedPermissions).not.toContain("shell.execute");
  });
});
