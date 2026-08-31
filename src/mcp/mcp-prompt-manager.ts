/**
 * Anantham V2 — MCP Prompt Manager
 *
 * Handles MCP-provided prompt templates as non-authoritative data/configuration,
 * guaranteeing that external MCP prompts cannot override runtime system policy or bypass approvals.
 */

import { type MCPPrompt } from "../domain/mcp.js";
import { type MCPClient } from "./mcp-client.js";

export interface MCPPromptRenderResult {
  promptName: string;
  serverId: string;
  isAuthoritative: false;
  description?: string;
  messages: Array<{ role: string; content: string }>;
}

export class MCPPromptManager {
  /**
   * Fetches and renders an MCP prompt template.
   */
  public async renderPrompt(
    prompt: MCPPrompt,
    client: MCPClient,
    args: Record<string, string> = {}
  ): Promise<MCPPromptRenderResult> {
    const rawResult = await client.getPrompt(prompt.name, args);

    let messages: Array<{ role: string; content: string }> = [];

    if (rawResult?.messages && Array.isArray(rawResult.messages)) {
      messages = rawResult.messages.map((m: any) => ({
        role: m.role || "user",
        content: typeof m.content === "string" ? m.content : m.content?.text || JSON.stringify(m.content),
      }));
    } else {
      messages = [{ role: "user", content: `MCP Prompt: ${prompt.name}` }];
    }

    return {
      promptName: prompt.name,
      serverId: prompt.serverId,
      isAuthoritative: false, // Critical invariant: MCP prompts are NEVER authoritative
      description: prompt.description,
      messages,
    };
  }
}
