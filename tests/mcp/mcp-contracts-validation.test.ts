import { describe, it, expect } from "vitest";
import {
  MCPServerConfigSchema,
  MCPToolSchema,
  MCPResourceSchema,
  MCPPromptSchema,
  MCPDiscoveryResultSchema,
  MCPServerRecordSchema,
} from "../../src/domain/mcp.js";

describe("P5.1 MCP — Domain Contracts & Runtime Validation", () => {
  it("validates MCPServerConfigSchema accurately", () => {
    const validConfig = MCPServerConfigSchema.parse({
      id: "mcp-playwright",
      name: "Playwright Browser MCP",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-playwright"],
      trustState: "user_approved",
    });

    expect(validConfig.id).toBe("mcp-playwright");
    expect(validConfig.transport).toBe("stdio");
    expect(validConfig.enabled).toBe(true);
    expect(validConfig.timeoutMs).toBe(30000);

    expect(() =>
      MCPServerConfigSchema.parse({
        id: "",
        name: "Invalid",
        transport: "invalid_transport",
      })
    ).toThrow();
  });

  it("validates MCPToolSchema, MCPResourceSchema, and MCPPromptSchema", () => {
    const tool = MCPToolSchema.parse({
      name: "browser_navigate",
      description: "Navigate to a URL",
      inputSchema: {
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"],
      },
      serverId: "mcp-playwright",
      isIdempotent: true,
      riskLevel: "medium",
    });
    expect(tool.name).toBe("browser_navigate");
    expect(tool.isIdempotent).toBe(true);

    const resource = MCPResourceSchema.parse({
      uri: "schema://neo4j/movies",
      name: "Neo4j Movies Schema",
      mimeType: "application/json",
      serverId: "mcp-neo4j",
    });
    expect(resource.uri).toBe("schema://neo4j/movies");

    const prompt = MCPPromptSchema.parse({
      name: "explain_code",
      description: "Code explanation template",
      arguments: [{ name: "code", required: true }],
      serverId: "mcp-devtools",
    });
    expect(prompt.arguments[0].name).toBe("code");
  });

  it("validates MCPDiscoveryResultSchema and MCPServerRecordSchema", () => {
    const discovery = MCPDiscoveryResultSchema.parse({
      serverId: "mcp-playwright",
      tools: [
        {
          name: "click",
          description: "Click element",
          inputSchema: {},
          serverId: "mcp-playwright",
        },
      ],
      resources: [],
      resourceTemplates: [],
      prompts: [],
      capabilities: { tools: true },
      discoveredAt: new Date().toISOString(),
      fingerprint: "sha256_hash_mock",
    });
    expect(discovery.tools.length).toBe(1);

    const record = MCPServerRecordSchema.parse({
      config: {
        id: "mcp-playwright",
        name: "Playwright",
        transport: "stdio",
      },
      discovery,
      connectionState: "connected",
      healthStatus: "healthy",
      consecutiveFailures: 0,
      circuitBroken: false,
    });
    expect(record.healthStatus).toBe("healthy");
    expect(record.connectionState).toBe("connected");
  });
});
