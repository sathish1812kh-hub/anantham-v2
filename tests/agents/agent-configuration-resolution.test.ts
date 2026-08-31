import { describe, it, expect } from "vitest";
import { AgentRegistry } from "../../src/agents/agent-registry.js";
import { AgentStartupResolver } from "../../src/agents/agent-startup-resolver.js";
import { AgentManifest } from "../../src/domain/agent.js";

describe("P6.1 Agents — Configuration & Manifest Resolution", () => {
  it("registers, updates status, and queries agent records", () => {
    const registry = new AgentRegistry();
    const manifest: AgentManifest = {
      id: "db-specialist",
      name: "Database Specialist",
      version: "1.0.0",
      role: "Database Architect",
      objective: "Design and verify SQLite schemas and migrations.",
      modelProfile: "reasoning",
      requiredCapabilities: [],
      tools: [],
      skills: [],
      permissionProfile: "developer",
      executorProfile: "local",
      budget: {},
      contextScope: { includeMemory: true },
      scope: "project",
      projectId: "proj_db",
    };

    const record = registry.register(manifest);
    expect(record.id).toBe("db-specialist");
    expect(registry.has("db-specialist")).toBe(true);

    registry.updateStatus("db-specialist", "ready");
    expect(registry.get("db-specialist")?.status).toBe("ready");

    expect(registry.list("proj_db").length).toBe(1);
    expect(registry.list("other_proj").length).toBe(0);
  });

  it("populates default budgets and scopes during resolution", () => {
    const resolver = new AgentStartupResolver();
    const manifest: AgentManifest = {
      id: "simple-agent",
      name: "Simple Agent",
      version: "1.0.0",
      role: "Simple Assistant",
      objective: "Perform simple tasks",
      modelProfile: "fast",
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
      projectId: "proj_default",
      sessionId: "sess_default",
    });

    expect(result.success).toBe(true);
    expect(result.startupPlan?.budget.maxTokens).toBe(100000);
    expect(result.startupPlan?.budget.maxCostUsd).toBe(5.0);
    expect(result.startupPlan?.memoryScope.namespace).toBe("agent:simple-agent");
  });
});
