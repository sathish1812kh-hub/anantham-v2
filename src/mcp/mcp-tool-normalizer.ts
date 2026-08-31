/**
 * Anantham V2 — MCP Tool Normalizer
 *
 * Normalizes discovered MCP tools into authoritative Anantham ToolRegistration contracts
 * so they can be registered in ToolRegistry and executed via ToolGateway with full policy enforcement.
 */

import { type MCPTool } from "../domain/mcp.js";
import { type ToolRegistration } from "../tools/tool-registry.js";
import { type ToolSpec } from "../domain/tool.js";
import { type MCPClient } from "./mcp-client.js";

export class MCPToolNormalizer {
  /**
   * Normalizes an MCP tool into an Anantham ToolRegistration.
   */
  public normalize(tool: MCPTool, client: MCPClient): ToolRegistration {
    const namespacedName = `mcp_${tool.serverId}_${tool.name}`.replace(/[^a-zA-Z0-9_]/g, "_");

    // Safe parameters schema construction with prototype pollution defense
    const rawSchema = (tool.inputSchema || {}) as Record<string, any>;
    const safeSchema: Record<string, unknown> = {
      type: "object",
      properties: {},
      required: Array.isArray(rawSchema.required) ? rawSchema.required : [],
    };

    if (rawSchema.properties && typeof rawSchema.properties === "object") {
      const props: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(rawSchema.properties as Record<string, unknown>)) {
        if (key === "__proto__" || key === "constructor" || key === "prototype") {
          continue;
        }
        props[key] = val;
      }
      safeSchema.properties = props;
    }

    const definition: ToolSpec = {
      name: namespacedName,
      description: `[MCP: ${tool.serverId}] ${tool.description || tool.name}`,
      parametersSchema: safeSchema,
      isIdempotent: Boolean(tool.isIdempotent),
      riskLevel: tool.riskLevel || "medium",
      sensitivity: tool.sensitivity || "normal",
      timeoutMs: tool.timeoutMs || client.config.timeoutMs,
    };

    const handler = async (args: any) => {
      const safeArgs = (args && typeof args === "object") ? args : {};
      const result = await client.callTool(tool.name, safeArgs);
      return result;
    };

    return {
      definition,
      handler,
    };
  }
}
