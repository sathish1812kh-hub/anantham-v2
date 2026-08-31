/**
 * Anantham V2 — MCP Client & Transports
 *
 * Provider-neutral client managing JSON-RPC 2.0 protocol handshakes,
 * capability discovery, tool calling, resource reading, and prompt expansion.
 */

import {
  type MCPServerConfig,
  type MCPDiscoveryResult,
  type MCPTool,
  type MCPResource,
  type MCPPrompt,
  type MCPConnectionState,
  type MCPHealthStatus,
  MCPServerConfigSchema,
  MCPDiscoveryResultSchema,
} from "../domain/mcp.js";
import { MCPCircuitBreaker } from "./mcp-circuit-breaker.js";
import { MCPOutputSanitizer } from "./mcp-output-sanitizer.js";
import { type EventStore } from "../event-state/event-store.js";
import { EventTypes } from "../domain/event.js";
import crypto from "node:crypto";

export interface MCPTransportAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendRequest<T = any>(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<T>;
  isConnected(): boolean;
}

export interface MCPClientOptions {
  config: MCPServerConfig;
  transportAdapter?: MCPTransportAdapter;
  eventStore?: EventStore;
  circuitBreaker?: MCPCircuitBreaker;
  sanitizer?: MCPOutputSanitizer;
}

export class MCPClient {
  public readonly config: MCPServerConfig;
  private connectionState: MCPConnectionState = "disconnected";
  private healthStatus: MCPHealthStatus = "healthy";
  private readonly transportAdapter?: MCPTransportAdapter;
  private readonly eventStore?: EventStore;
  public readonly circuitBreaker: MCPCircuitBreaker;
  public readonly sanitizer: MCPOutputSanitizer;
  private discoveryResult?: MCPDiscoveryResult;
  private lastConnectedAt?: string;

  constructor(options: MCPClientOptions) {
    this.config = MCPServerConfigSchema.parse(options.config);
    this.transportAdapter = options.transportAdapter;
    this.eventStore = options.eventStore;
    this.sanitizer = options.sanitizer || new MCPOutputSanitizer();
    this.circuitBreaker =
      options.circuitBreaker ||
      new MCPCircuitBreaker({
        onStateChange: (newState) => {
          if (newState === "open") {
            this.healthStatus = "unhealthy";
            this.emitEvent(EventTypes.MCP_CIRCUIT_BROKEN, {
              serverId: this.config.id,
              status: "open",
            });
          } else if (newState === "closed") {
            this.healthStatus = "healthy";
          }
        },
      });

    if (!this.config.enabled) {
      this.connectionState = "disabled";
      this.healthStatus = "disabled";
    }
  }

  public getConnectionState(): MCPConnectionState {
    return this.connectionState;
  }

  public getHealthStatus(): MCPHealthStatus {
    return this.healthStatus;
  }

  public getLastConnectedAt(): string | undefined {
    return this.lastConnectedAt;
  }

  public getDiscoveryResult(): MCPDiscoveryResult | undefined {
    return this.discoveryResult;
  }

  /**
   * Connect and perform initialization handshake.
   */
  public async connect(): Promise<void> {
    if (!this.config.enabled) {
      throw new Error(`MCP Server "${this.config.id}" is disabled.`);
    }

    if (!this.circuitBreaker.canExecute()) {
      throw new Error(
        `MCP Server "${this.config.id}" circuit breaker is OPEN. Cooldown remaining: ${this.circuitBreaker.getCooldownRemainingMs()}ms.`
      );
    }

    try {
      this.connectionState = "connecting";
      if (this.transportAdapter) {
        await this.transportAdapter.connect();
      }

      this.connectionState = "initializing";
      // Perform initialize handshake if transport exists
      if (this.transportAdapter) {
        await this.transportAdapter.sendRequest(
          "initialize",
          {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {},
              resources: {},
              prompts: {},
            },
            clientInfo: {
              name: "anantham-v2",
              version: "2.0.0-alpha.1",
            },
          },
          this.config.timeoutMs
        );
      }

      this.connectionState = "connected";
      this.healthStatus = "healthy";
      this.lastConnectedAt = new Date().toISOString();
      this.circuitBreaker.recordSuccess();

      this.emitEvent(EventTypes.MCP_CONNECTED, {
        serverId: this.config.id,
        transport: this.config.transport,
      });
    } catch (err: any) {
      this.connectionState = "failed";
      this.healthStatus = "unhealthy";
      this.circuitBreaker.recordFailure();
      this.emitEvent(EventTypes.MCP_FAILED, {
        serverId: this.config.id,
        error: err.message,
      });
      throw err;
    }
  }

  /**
   * Run capability discovery across tools, resources, and prompts.
   */
  public async discover(): Promise<MCPDiscoveryResult> {
    if (this.connectionState !== "connected") {
      await this.connect();
    }

    if (!this.circuitBreaker.canExecute()) {
      throw new Error(`MCP Server "${this.config.id}" circuit breaker is OPEN.`);
    }

    try {
      let tools: MCPTool[] = [];
      let resources: MCPResource[] = [];
      let prompts: MCPPrompt[] = [];

      if (this.transportAdapter) {
        // 1. List tools
        const toolsRes = await this.transportAdapter.sendRequest<{ tools: MCPTool[] }>(
          "tools/list",
          {},
          this.config.timeoutMs
        );
        if (toolsRes?.tools && Array.isArray(toolsRes.tools)) {
          tools = toolsRes.tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema || {},
            serverId: this.config.id,
            isIdempotent: Boolean(t.isIdempotent),
            category: t.category || "unknown",
            riskLevel: t.riskLevel || "medium",
            sensitivity: t.sensitivity || "normal",
          }));
        }

        // 2. List resources
        const resRes = await this.transportAdapter.sendRequest<{ resources: MCPResource[] }>(
          "resources/list",
          {},
          this.config.timeoutMs
        );
        if (resRes?.resources && Array.isArray(resRes.resources)) {
          resources = resRes.resources.map((r) => ({
            uri: r.uri,
            name: r.name,
            description: r.description,
            mimeType: r.mimeType || "text/plain",
            serverId: this.config.id,
            size: r.size,
          }));
        }

        // 3. List prompts
        const promptsRes = await this.transportAdapter.sendRequest<{ prompts: MCPPrompt[] }>(
          "prompts/list",
          {},
          this.config.timeoutMs
        );
        if (promptsRes?.prompts && Array.isArray(promptsRes.prompts)) {
          prompts = promptsRes.prompts.map((p) => ({
            name: p.name,
            description: p.description,
            arguments: p.arguments || [],
            serverId: this.config.id,
          }));
        }
      }

      const fingerprint = crypto
        .createHash("sha256")
        .update(JSON.stringify({ tools, resources, prompts }))
        .digest("hex");

      const result: MCPDiscoveryResult = MCPDiscoveryResultSchema.parse({
        serverId: this.config.id,
        tools,
        resources,
        resourceTemplates: [],
        prompts,
        capabilities: { tools: true, resources: true, prompts: true },
        discoveredAt: new Date().toISOString(),
        fingerprint,
      });

      this.discoveryResult = result;
      this.circuitBreaker.recordSuccess();

      this.emitEvent(EventTypes.MCP_DISCOVERED, {
        serverId: this.config.id,
        toolCount: tools.length,
        resourceCount: resources.length,
        promptCount: prompts.length,
        fingerprint,
      });

      return result;
    } catch (err: any) {
      this.circuitBreaker.recordFailure();
      throw err;
    }
  }

  /**
   * Invoke a discovered MCP tool.
   */
  public async callTool(toolName: string, args: Record<string, unknown>): Promise<any> {
    if (this.connectionState !== "connected") {
      await this.connect();
    }

    if (!this.circuitBreaker.canExecute()) {
      throw new Error(`MCP Server "${this.config.id}" circuit breaker is OPEN.`);
    }

    try {
      let rawResult: any;
      if (this.transportAdapter) {
        rawResult = await this.transportAdapter.sendRequest(
          "tools/call",
          {
            name: toolName,
            arguments: args,
          },
          this.config.timeoutMs
        );
      } else {
        rawResult = { content: [{ type: "text", text: `Mock tool ${toolName} output` }] };
      }

      const sanitizedResult = this.sanitizer.sanitizeStructured(rawResult);
      this.circuitBreaker.recordSuccess();

      this.emitEvent(EventTypes.MCP_TOOL_CALLED, {
        serverId: this.config.id,
        toolName,
      });

      return sanitizedResult;
    } catch (err: any) {
      this.circuitBreaker.recordFailure();
      const sanitizedMsg = this.sanitizer.sanitizeText(err.message || "MCP Tool execution failed");
      throw new Error(sanitizedMsg);
    }
  }

  /**
   * Read an MCP resource by URI.
   */
  public async readResource(uri: string): Promise<any> {
    if (this.connectionState !== "connected") {
      await this.connect();
    }

    if (!this.circuitBreaker.canExecute()) {
      throw new Error(`MCP Server "${this.config.id}" circuit breaker is OPEN.`);
    }

    try {
      let rawResult: any;
      if (this.transportAdapter) {
        rawResult = await this.transportAdapter.sendRequest(
          "resources/read",
          { uri },
          this.config.timeoutMs
        );
      } else {
        rawResult = { contents: [{ uri, mimeType: "text/plain", text: "Mock resource data" }] };
      }

      const sanitizedResult = this.sanitizer.sanitizeStructured(rawResult);
      this.circuitBreaker.recordSuccess();

      this.emitEvent(EventTypes.MCP_RESOURCE_READ, {
        serverId: this.config.id,
        uri,
      });

      return sanitizedResult;
    } catch (err: any) {
      this.circuitBreaker.recordFailure();
      const sanitizedMsg = this.sanitizer.sanitizeText(err.message || "MCP Resource read failed");
      throw new Error(sanitizedMsg);
    }
  }

  /**
   * Retrieve an MCP prompt template.
   */
  public async getPrompt(promptName: string, args: Record<string, string> = {}): Promise<any> {
    if (this.connectionState !== "connected") {
      await this.connect();
    }

    if (!this.circuitBreaker.canExecute()) {
      throw new Error(`MCP Server "${this.config.id}" circuit breaker is OPEN.`);
    }

    try {
      let rawResult: any;
      if (this.transportAdapter) {
        rawResult = await this.transportAdapter.sendRequest(
          "prompts/get",
          { name: promptName, arguments: args },
          this.config.timeoutMs
        );
      } else {
        rawResult = {
          description: `Prompt ${promptName}`,
          messages: [{ role: "user", content: { type: "text", text: `Template ${promptName}` } }],
        };
      }

      const sanitizedResult = this.sanitizer.sanitizeStructured(rawResult);
      this.circuitBreaker.recordSuccess();

      this.emitEvent(EventTypes.MCP_PROMPT_RETRIEVED, {
        serverId: this.config.id,
        promptName,
      });

      return sanitizedResult;
    } catch (err: any) {
      this.circuitBreaker.recordFailure();
      const sanitizedMsg = this.sanitizer.sanitizeText(err.message || "MCP Prompt retrieval failed");
      throw new Error(sanitizedMsg);
    }
  }

  /**
   * Gracefully disconnect from server.
   */
  public async disconnect(): Promise<void> {
    if (this.connectionState === "disconnected") {
      return;
    }

    this.connectionState = "disconnecting";
    if (this.transportAdapter) {
      await this.transportAdapter.disconnect();
    }
    this.connectionState = "disconnected";

    this.emitEvent(EventTypes.MCP_DISCONNECTED, {
      serverId: this.config.id,
    });
  }

  private emitEvent(type: string, payload: Record<string, unknown>): void {
    if (this.eventStore) {
      this.eventStore.append({
        id: `evt_mcp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        schemaVersion: 1,
        projectId: this.config.projectId || "global",
        type,
        actor: "system",
        timestamp: new Date().toISOString(),
        payload,
      });
    }
  }
}
