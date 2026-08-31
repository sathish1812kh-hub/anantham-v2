import { describe, it, expect } from "vitest";
import {
  AgentManifestSchema,
  AgentStartupPlanSchema,
  AgentRuntimeStateSchema,
  AgentBudgetSchema,
  AgentContextScopeSchema,
  AgentMemoryScopeSchema,
} from "../../src/domain/agent.js";

describe("P6.1 Agents — Domain Contracts & Runtime Validation", () => {
  it("validates valid AgentManifest strictly", () => {
    const manifest = {
      id: "code-reviewer",
      name: "Senior Code Reviewer",
      version: "1.0.0",
      role: "Reviewing code for safety and style",
      objective: "Inspect pull requests, analyze diffs, and generate review feedback.",
      modelProfile: "reasoning",
      requiredCapabilities: ["toolCalling"],
      tools: ["filesystem.read"],
      skills: [],
      permissionProfile: "developer",
      executorProfile: "local",
      budget: { maxTokens: 50000, maxCostUsd: 2.0 },
      contextScope: { maxTokens: 32000, includeMemory: true },
      scope: "project" as const,
      projectId: "proj_123",
    };

    const parsed = AgentManifestSchema.safeParse(manifest);
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid SemVer or malformed manifest", () => {
    const invalid = {
      id: "invalid agent ID with spaces!",
      name: "Invalid",
      version: "v1_beta", // Not strict SemVer
      role: "Role",
      objective: "Objective",
    };

    const parsed = AgentManifestSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it("validates AgentStartupPlan and AgentRuntimeState schemas", () => {
    const plan = {
      planId: "plan_test_01",
      agentId: "test-agent",
      version: "1.0.0",
      role: "Tester",
      objective: "Run automated test fixtures",
      resolvedModel: {
        modelId: "claude-3-7-sonnet",
        provider: "anthropic",
        contextLimit: 200000,
      },
      resolvedCapabilities: ["toolCalling"],
      resolvedTools: ["filesystem.read"],
      resolvedSkills: [],
      grantedPermissions: ["filesystem.read", "tool.invoke"],
      executor: { type: "local", isSandboxed: false },
      contextScope: { includeMemory: true },
      memoryScope: { namespace: "agent:test-agent", readonly: false, crossProjectAccess: false },
      budget: { maxTokens: 100000 },
      projectId: "proj_01",
      sessionId: "sess_01",
      resolvedAt: new Date().toISOString(),
    };

    const parsedPlan = AgentStartupPlanSchema.safeParse(plan);
    expect(parsedPlan.success).toBe(true);

    if (parsedPlan.success) {
      const state = {
        instanceId: "inst_01",
        agentId: "test-agent",
        startupPlan: parsedPlan.data,
        status: "running" as const,
        tokensConsumed: 1200,
        costUsdConsumed: 0.05,
        toolCallsExecuted: 2,
        startedAt: new Date().toISOString(),
      };
      const parsedState = AgentRuntimeStateSchema.safeParse(state);
      expect(parsedState.success).toBe(true);
    }
  });
});
