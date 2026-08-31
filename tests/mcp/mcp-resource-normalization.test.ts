import { describe, it, expect } from "vitest";
import { MCPResourceNormalizer } from "../../src/mcp/mcp-resource-normalizer.js";
import { MCPClient, type MCPTransportAdapter } from "../../src/mcp/mcp-client.js";

describe("P5.1 MCP Resource Normalization — ContentObject Pipeline", () => {
  it("normalizes MCP resource into ContentObject with SHA-256 provenance", async () => {
    const normalizer = new MCPResourceNormalizer();

    const mockTransport: MCPTransportAdapter = {
      connect: async () => {},
      disconnect: async () => {},
      isConnected: () => true,
      sendRequest: async (method: string, params?: any) => {
        if (method === "resources/read") {
          return { contents: [{ uri: params.uri, mimeType: "text/plain", text: "Database schema details" }] };
        }
        return {};
      },
    };

    const client = new MCPClient({
      config: {
        id: "srv_neo4j",
        name: "Neo4j",
        transport: "stdio",
      },
      transportAdapter: mockTransport,
    });

    const mcpResource = {
      uri: "schema://graph/entities",
      name: "Entities Schema",
      mimeType: "text/plain",
      serverId: "srv_neo4j",
    };

    const contentObj = await normalizer.normalize(mcpResource, client);
    expect(contentObj.id).toContain("cnt_mcp_srv_neo4j");
    expect(contentObj.kind).toBe("mcp-resource");
    expect(contentObj.name).toBe("Entities Schema");
    expect(contentObj.mimeType).toBe("text/plain");
    expect(contentObj.representations[0].data).toContain("Database schema details");
    expect(contentObj.provenance.sourceType).toBe("mcp");
    expect(contentObj.provenance.sourceUri).toBe("schema://graph/entities");
    expect(contentObj.sha256).toBeDefined();
  });
});
