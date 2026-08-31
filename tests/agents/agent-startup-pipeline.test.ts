import { describe, it, expect } from "vitest";
import { AgentManager } from "../../src/agents/agent-manager.js";
import { AgentRegistry } from "../../src/agents/agent-registry.js";
import { AgentStartupResolver } from "../../src/agents/agent-startup-resolver.js";
import { AgentManifest } from "../../src/domain/agent.js";

describe("P6.1 Agents — Deterministic Startup Pipeline & Lifecycle", () => {
  it("executes full lifecycle: register -> resolve -> ready -> instance created -> stopped", () => {
    const registry = new AgentRegistry();
    const resolver = new AgentStartupResolver();
    const manager = new AgentManager({ registry, resolver });

    const manifest: AgentManifest = {
      id: "qa-agent",
      name: "QA Agent",
      version: "1.0.0",
      role: "QA Tester",
      objective: "Execute tests and report bugs",
      modelProfile: "fast",
      requiredCapabilities: [],
      tools: [],
      skills: [],
      permissionProfile: "developer",
      executorProfile: "local",
      budget: {},
      contextScope: { includeMemory: true },
      scope: "project",
      projectId: "proj_qa",
    };

    manager.register(manifest);
    expect(manager.get("qa-agent")?.status).toBe("configured");

    const res = manager.resolveStartup("qa-agent", {
      projectId: "proj_qa",
      sessionId: "sess_qa",
      taskId: "task_qa_01",
    });

    expect(res.success).toBe(true);
    expect(res.startupPlan).toBeDefined();
    expect(manager.get("qa-agent")?.status).toBe("ready");

    if (res.startupPlan) {
      const instance = manager.createInstance(res.startupPlan);
      expect(instance.status).toBe("running");
      expect(manager.getInstance(instance.instanceId)).toBeDefined();

      manager.recordConsumption(instance.instanceId, 500, 0.02, 1);
      expect(manager.getInstance(instance.instanceId)?.tokensConsumed).toBe(500);

      const stopped = manager.stopInstance(instance.instanceId);
      expect(stopped).toBe(true);
      expect(manager.getInstance(instance.instanceId)?.status).toBe("stopped");
    }
  });
});
