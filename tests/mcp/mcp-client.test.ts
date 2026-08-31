import { describe, it, expect } from "vitest";
import { MCPClient, type MCPTransportAdapter } from "../../src/mcp/mcp-client.js";

describe("P5.1 MCP Client — Protocol Execution & Discovery", () => {
  it("connects, negotiates initialization, and executes tool calls", async () => {
    let initialized = false;
    const mockTransport: MCPTransportAdapter = {
      connect: async () => {},
      disconnect: async () => {},
      isConnected: () => true,
      sendRequest: async (method: string, params?: Record<string, unknown>) => {
        if (method === "initialize") {
          initialized = true;
          return { serverInfo: { name: "mock-server", version: "1.0.0" } };
        }
        if (method === "tools/list") {
          return {
            tools: [
              {
                name: "query_database",
                description: "Run a database query",
                inputSchema: {
                  type: "object",
                  properties: { query: { type: "string" } },
                },
              },
            ],
          };
        }
        if (method === "tools/call") {
          return { content: [{ type: "text", text: "Query result: 42 records" }] };
        }
        return {};
      },
    };

    const client = new MCPClient({
      config: {
        id: "srv_test",
        name: "Test Server",
        transport: "stdio",
      },
      transportAdapter: mockTransport,
    });

    await client.connect();
    expect(initialized).toBe(true);
    expect(client.getConnectionState()).toBe("connected");

    const discovery = await client.discover();
    expect(discovery.tools.length).toBe(1);
    expect(discovery.tools[0].name).toBe("query_database");

    const result = await client.callTool("query_database", { query: "SELECT * FROM data" });
    expect(result.content[0].text).toContain("42 records");

    await client.disconnect();
    expect(client.getConnectionState()).toBe("disconnected");
  });
});
