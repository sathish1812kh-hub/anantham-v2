/**
 * Anantham V2 — MCP Registry
 *
 * Authoritative registry managing MCP server configurations, client instances,
 * capability discovery, and automatic synchronization into ToolRegistry.
 */

import {
  type MCPServerConfig,
  type MCPServerRecord,
  type MCPDiscoveryResult,
  MCPServerConfigSchema,
  MCPServerRecordSchema,
} from "../domain/mcp.js";
import { MCPClient, type MCPTransportAdapter } from "./mcp-client.js";
import { MCPToolNormalizer } from "./mcp-tool-normalizer.js";
import { type ToolRegistry } from "../tools/tool-registry.js";
import { type EventStore } from "../event-state/event-store.js";
import { EventTypes } from "../domain/event.js";

export interface MCPRegistryOptions {
  eventStore?: EventStore;
  toolNormalizer?: MCPToolNormalizer;
}

export class MCPRegistry {
  private readonly servers = new Map<string, MCPServerRecord>();
  private readonly clients = new Map<string, MCPClient>();
  private readonly eventStore?: EventStore;
  private readonly toolNormalizer: MCPToolNormalizer;

  constructor(options: MCPRegistryOptions = {}) {
    this.eventStore = options.eventStore;
    this.toolNormalizer = options.toolNormalizer || new MCPToolNormalizer();
  }

  /**
   * Register a new MCP server configuration.
   */
  public registerServer(
    config: MCPServerConfig,
    transportAdapter?: MCPTransportAdapter
  ): MCPServerRecord {
    const validatedConfig = MCPServerConfigSchema.parse(config);

    if (this.servers.has(validatedConfig.id)) {
      throw new Error(`MCP Server "${validatedConfig.id}" is already registered.`);
    }

    const record: MCPServerRecord = MCPServerRecordSchema.parse({
      config: validatedConfig,
      connectionState: validatedConfig.enabled ? "disconnected" : "disabled",
      healthStatus: validatedConfig.enabled ? "healthy" : "disabled",
      consecutiveFailures: 0,
      circuitBroken: false,
    });

    const client = new MCPClient({
      config: validatedConfig,
      transportAdapter,
      eventStore: this.eventStore,
    });

    this.servers.set(validatedConfig.id, record);
    this.clients.set(validatedConfig.id, client);

    this.emitEvent(EventTypes.MCP_REGISTERED, {
      serverId: validatedConfig.id,
      transport: validatedConfig.transport,
      projectId: validatedConfig.projectId,
    });

    return record;
  }

  /**
   * Unregister an MCP server and disconnect client.
   */
  public async unregisterServer(serverId: string): Promise<boolean> {
    const client = this.clients.get(serverId);
    if (client) {
      await client.disconnect();
      this.clients.delete(serverId);
    }

    const deleted = this.servers.delete(serverId);
    if (deleted) {
      this.emitEvent(EventTypes.MCP_DEREGISTERED, { serverId });
    }
    return deleted;
  }

  public getServer(serverId: string): MCPServerRecord | undefined {
    return this.servers.get(serverId);
  }

  public getClient(serverId: string): MCPClient | undefined {
    return this.clients.get(serverId);
  }

  /**
   * List servers with optional project-level isolation filtering.
   */
  public listServers(projectId?: string): MCPServerRecord[] {
    const records = Array.from(this.servers.values());
    if (!projectId) {
      return records;
    }
    // Return global servers + project-specific servers
    return records.filter(
      (r) => !r.config.projectId || r.config.projectId === projectId || r.config.projectId === "global"
    );
  }

  /**
   * Enable an existing MCP server.
   */
  public enableServer(serverId: string): MCPServerRecord {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`MCP Server "${serverId}" not found.`);
    }

    server.config.enabled = true;
    server.connectionState = "disconnected";
    server.healthStatus = "healthy";

    return server;
  }

  /**
   * Disable an existing MCP server.
   */
  public async disableServer(serverId: string): Promise<MCPServerRecord> {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`MCP Server "${serverId}" not found.`);
    }

    server.config.enabled = false;
    server.connectionState = "disabled";
    server.healthStatus = "disabled";

    const client = this.clients.get(serverId);
    if (client) {
      await client.disconnect();
    }

    return server;
  }

  /**
   * Discover capabilities for an MCP server and update records.
   */
  public async discoverServer(serverId: string): Promise<MCPDiscoveryResult> {
    const client = this.clients.get(serverId);
    const server = this.servers.get(serverId);
    if (!client || !server) {
      throw new Error(`MCP Server "${serverId}" not found.`);
    }

    const discovery = await client.discover();
    server.discovery = discovery;
    server.connectionState = client.getConnectionState();
    server.healthStatus = client.getHealthStatus();

    return discovery;
  }

  /**
   * Synchronize discovered tools from an MCP server directly into Anantham ToolRegistry.
   */
  public async syncToolsToRegistry(serverId: string, toolRegistry: ToolRegistry): Promise<number> {
    const client = this.clients.get(serverId);
    const server = this.servers.get(serverId);
    if (!client || !server) {
      throw new Error(`MCP Server "${serverId}" not found.`);
    }

    if (!server.discovery) {
      await this.discoverServer(serverId);
    }

    let count = 0;
    if (server.discovery?.tools) {
      for (const tool of server.discovery.tools) {
        const registration = this.toolNormalizer.normalize(tool, client);
        toolRegistry.register(registration);
        count++;
      }
    }

    return count;
  }

  private emitEvent(type: string, payload: Record<string, unknown>): void {
    if (this.eventStore) {
      this.eventStore.append({
        id: `evt_mcp_reg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        schemaVersion: 1,
        projectId: payload.projectId as string || "global",
        type,
        actor: "system",
        timestamp: new Date().toISOString(),
        payload,
      });
    }
  }
}
