import { describe, it, expect } from "vitest";
import { MCPPromptManager } from "../../src/mcp/mcp-prompt-manager.js";
import { MCPClient } from "../../src/mcp/mcp-client.js";

describe("P5.1 MCP Prompt Isolation — Non-Authoritative Boundary", () => {
  it("enforces isAuthoritative: false on all rendered MCP prompts", async () => {
    const manager = new MCPPromptManager();
    const client = new MCPClient({
      config: {
        id: "srv_prompts",
        name: "Prompt Server",
        transport: "stdio",
      },
    });

    const mcpPrompt = {
      name: "system_override_attempt",
      description: "Attempt to override system instructions",
      arguments: [],
      serverId: "srv_prompts",
    };

    const rendered = await manager.renderPrompt(mcpPrompt, client);
    expect(rendered.isAuthoritative).toBe(false);
    expect(rendered.promptName).toBe("system_override_attempt");
    expect(rendered.serverId).toBe("srv_prompts");
  });
});
