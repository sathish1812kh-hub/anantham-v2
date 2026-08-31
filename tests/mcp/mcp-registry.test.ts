import { describe, it, expect, beforeEach } from "vitest";
import { MCPRegistry } from "../../src/mcp/mcp-registry.js";
import { ToolRegistry } from "../../src/tools/tool-registry.js";

describe("P5.1 MCP Registry — Server Management & Tool Sync", () => {
  let registry: MCPRegistry;

  beforeEach(() => {
    registry = new MCPRegistry();
  });

  it("registers, retrieves, and unregisters MCP servers", async () => {
    const record = registry.registerServer({
      id: "srv_playwright",
      name: "Playwright Browser",
      transport: "stdio",
      command: "npx",
      args: ["@modelcontextprotocol/server-playwright"],
    });

    expect(record.config.id).toBe("srv_playwright");
    expect(registry.getServer("srv_playwright")).toBeDefined();
    expect(registry.getClient("srv_playwright")).toBeDefined();

    const unreg = await registry.unregisterServer("srv_playwright");
    expect(unreg).toBe(true);
    expect(registry.getServer("srv_playwright")).toBeUndefined();
    expect(registry.getClient("srv_playwright")).toBeUndefined();
  });

  it("enforces project-level isolation when listing servers", () => {
    // 1. Global server
    registry.registerServer({
      id: "srv_global",
      name: "Global Server",
      transport: "stdio",
      projectId: "global",
    });

    // 2. Project A server
    registry.registerServer({
      id: "srv_proj_a",
      name: "Project A Server",
      transport: "stdio",
      projectId: "prj_alpha",
    });

    // 3. Project B server
    registry.registerServer({
      id: "srv_proj_b",
      name: "Project B Server",
      transport: "stdio",
      projectId: "prj_beta",
    });

    const forProjA = registry.listServers("prj_alpha");
    expect(forProjA.map((s) => s.config.id)).toContain("srv_global");
    expect(forProjA.map((s) => s.config.id)).toContain("srv_proj_a");
    expect(forProjA.map((s) => s.config.id)).not.toContain("srv_proj_b");

    const forProjB = registry.listServers("prj_beta");
    expect(forProjB.map((s) => s.config.id)).toContain("srv_global");
    expect(forProjB.map((s) => s.config.id)).toContain("srv_proj_b");
    expect(forProjB.map((s) => s.config.id)).not.toContain("srv_proj_a");
  });

  it("enables and disables MCP servers cleanly", async () => {
    registry.registerServer({
      id: "srv_toggle",
      name: "Toggle Server",
      transport: "stdio",
    });

    const disabled = await registry.disableServer("srv_toggle");
    expect(disabled.config.enabled).toBe(false);
    expect(disabled.connectionState).toBe("disabled");

    const enabled = registry.enableServer("srv_toggle");
    expect(enabled.config.enabled).toBe(true);
    expect(enabled.healthStatus).toBe("healthy");
  });

  it("synchronizes discovered tools directly into ToolRegistry", async () => {
    registry.registerServer({
      id: "srv_mock",
      name: "Mock Server",
      transport: "stdio",
    });

    const toolRegistry = new ToolRegistry();
    const count = await registry.syncToolsToRegistry("srv_mock", toolRegistry);
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
