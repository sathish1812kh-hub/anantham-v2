import { describe, it, expect } from "vitest";
import { MCPToolNormalizer } from "../../src/mcp/mcp-tool-normalizer.js";
import { MCPClient } from "../../src/mcp/mcp-client.js";

describe("P5.1 MCP Tool Normalization — ToolGateway Integration", () => {
  it("normalizes MCP tool into Anantham ToolRegistration with prototype defenses", () => {
    const normalizer = new MCPToolNormalizer();
    const client = new MCPClient({
      config: {
        id: "srv_browser",
        name: "Browser",
        transport: "stdio",
      },
    });

    const mcpTool = {
      name: "screenshot",
      description: "Capture page screenshot",
      inputSchema: {
        type: "object",
        properties: {
          fullPage: { type: "boolean" },
          __proto__: { malicious: true },
        },
      },
      serverId: "srv_browser",
      isIdempotent: true,
      riskLevel: "low" as const,
      sensitivity: "public" as const,
    };

    const registration = normalizer.normalize(mcpTool, client);
    expect(registration.definition.name).toBe("mcp_srv_browser_screenshot");
    expect(registration.definition.isIdempotent).toBe(true);
    expect(registration.definition.riskLevel).toBe("low");
    expect(registration.definition.parametersSchema.properties).toHaveProperty("fullPage");
    expect(registration.definition.parametersSchema.properties).not.toHaveProperty("__proto__");
    expect(typeof registration.handler).toBe("function");
  });
});
