import { describe, it, expect } from "vitest";
import { MCPRegistry } from "../../src/mcp/mcp-registry.js";
import { ToolRegistry } from "../../src/tools/tool-registry.js";
import { ToolGateway } from "../../src/tools/tool-gateway.js";

describe("P5.1 MCP ToolGateway Enforcement — Zero Policy Bypass", () => {
  it("executes discovered MCP tools strictly through ToolGateway", async () => {
    const mcpRegistry = new MCPRegistry();
    const toolRegistry = new ToolRegistry();

    mcpRegistry.registerServer({
      id: "srv_mock_tools",
      name: "Mock Server",
      transport: "stdio",
    });

    await mcpRegistry.syncToolsToRegistry("srv_mock_tools", toolRegistry);

    const gateway = new ToolGateway({ registry: toolRegistry });

    // Manually register a test tool from the MCP client to simulate discovery
    const client = mcpRegistry.getClient("srv_mock_tools")!;
    toolRegistry.register({
      definition: {
        name: "mcp_srv_mock_tools_search",
        description: "Search data",
        parametersSchema: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
        isIdempotent: true,
        riskLevel: "low",
      },
      handler: async (args: any) => {
        return client.callTool("search", args);
      },
    });

    const res = await gateway.invoke({
      callId: "call_mcp_test_01",
      toolName: "mcp_srv_mock_tools_search",
      arguments: { query: "Anantham" },
      actor: { id: "agent_01", type: "agent" },
      project: { id: "prj_01" },
    });

    expect(res.status).toBe("success");
    expect(res.result).toBeDefined();
  });
});
