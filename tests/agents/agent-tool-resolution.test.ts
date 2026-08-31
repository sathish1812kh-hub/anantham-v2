import { describe, it, expect } from "vitest";
import { AgentStartupResolver } from "../../src/agents/agent-startup-resolver.js";
import { ToolRegistry } from "../../src/tools/tool-registry.js";
import { AgentManifest } from "../../src/domain/agent.js";

describe("P6.1 Agents — Tool Resolution & Registry Binding", () => {
  it("resolves tools successfully when registered in ToolRegistry", () => {
    const toolRegistry = new ToolRegistry();
    toolRegistry.register({
      definition: {
        name: "filesystem.read",
        description: "Read file contents",
        parametersSchema: { type: "object" },
        isIdempotent: true,
      },
      handler: async () => ({ content: "file content" }),
    });

    const resolver = new AgentStartupResolver({ toolRegistry });
    const manifest: AgentManifest = {
      id: "fs-agent",
      name: "FS Agent",
      version: "1.0.0",
      role: "File Reader",
      objective: "Read repo files",
      modelProfile: "fast",
      requiredCapabilities: [],
      tools: ["filesystem.read"],
      skills: [],
      permissionProfile: "developer",
      executorProfile: "local",
      budget: {},
      contextScope: { includeMemory: true },
      scope: "global",
    };

    const result = resolver.resolve(manifest, {
      projectId: "proj_tool",
      sessionId: "sess_tool",
    });

    expect(result.success).toBe(true);
    expect(result.startupPlan?.resolvedTools).toContain("filesystem.read");
  });

  it("fails startup when a required tool is missing from ToolRegistry", () => {
    const toolRegistry = new ToolRegistry();
    const resolver = new AgentStartupResolver({ toolRegistry });

    const manifest: AgentManifest = {
      id: "missing-tool-agent",
      name: "Missing Tool Agent",
      version: "1.0.0",
      role: "Executor",
      objective: "Execute missing tool",
      modelProfile: "fast",
      requiredCapabilities: [],
      tools: ["nonexistent.tool"],
      skills: [],
      permissionProfile: "developer",
      executorProfile: "local",
      budget: {},
      contextScope: { includeMemory: true },
      scope: "global",
    };

    const result = resolver.resolve(manifest, {
      projectId: "proj_tool_err",
      sessionId: "sess_tool_err",
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("TOOL_UNRESOLVABLE");
    expect(result.errorMessage).toContain("nonexistent.tool");
  });
});
