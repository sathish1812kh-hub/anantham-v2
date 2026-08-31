/**
 * Anantham V2 — Plugin Manager & Lifecycle Engine
 *
 * Coordinates full plugin lifecycle transitions (discover, install, activate,
 * enable, disable, unload, reload, update, rollback, health checks).
 */

import {
  type PluginManifest,
  type PluginRecord,
  PluginRecordSchema,
} from "../domain/plugin.js";
import { PluginInstaller, type InstallOptions } from "./plugin-installer.js";
import { type ToolRegistry } from "../tools/tool-registry.js";
import { type EventStore } from "../event-state/event-store.js";
import { EventTypes } from "../domain/event.js";

export interface PluginManagerOptions {
  installer?: PluginInstaller;
  toolRegistry?: ToolRegistry;
  eventStore?: EventStore;
  installBaseDir?: string;
  projectId?: string;
}

export class PluginManager {
  private readonly plugins = new Map<string, PluginRecord>();
  private readonly installer: PluginInstaller;
  private readonly toolRegistry?: ToolRegistry;
  private readonly eventStore?: EventStore;
  private readonly installBaseDir?: string;
  private readonly projectId: string;

  constructor(options: PluginManagerOptions = {}) {
    this.installer = options.installer || new PluginInstaller();
    this.toolRegistry = options.toolRegistry;
    this.eventStore = options.eventStore;
    this.installBaseDir = options.installBaseDir || "plugins";
    this.projectId = options.projectId || "global";
  }

  public getPlugin(pluginId: string): PluginRecord | undefined {
    return this.plugins.get(pluginId);
  }

  public listPlugins(): PluginRecord[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Discovers and inspects a plugin manifest.
   */
  public discover(manifest: PluginManifest): PluginRecord {
    const record: PluginRecord = PluginRecordSchema.parse({
      manifest,
      trustState: "unknown",
      lifecycleState: "discovered",
      healthState: "healthy",
      activeRegistrations: { tools: [], commands: [], hooks: [], providers: [] },
    });

    this.plugins.set(manifest.id, record);
    this.emitEvent(EventTypes.PLUGIN_DISCOVERED, { pluginId: manifest.id, version: manifest.version });
    return record;
  }

  /**
   * Installs a plugin package payload.
   */
  public install(manifest: PluginManifest, options: InstallOptions = {}): PluginRecord {
    const installedManifests = Array.from(this.plugins.values()).map((p) => p.manifest);
    const record = this.installer.install(manifest, {
      ...options,
      installDir: options.installDir || this.installBaseDir,
      installedManifests,
    });

    this.plugins.set(manifest.id, record);
    this.emitEvent(EventTypes.PLUGIN_INSTALLED, {
      pluginId: manifest.id,
      version: manifest.version,
      checksum: manifest.checksum,
    });
    return record;
  }

  /**
   * Activates and enables an installed plugin.
   */
  public activate(pluginId: string): PluginRecord {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin "${pluginId}" is not installed.`);
    }

    if (plugin.trustState === "blocked") {
      throw new Error(`Cannot activate plugin "${pluginId}": Plugin is BLOCKED.`);
    }

    // Register provided tools into ToolRegistry if available
    const registeredTools: string[] = [];
    if (this.toolRegistry && plugin.manifest.provides) {
      for (const prov of plugin.manifest.provides) {
        if (prov.startsWith("tool:")) {
          const toolName = prov.slice(5);
          const namespaced = `plugin_${plugin.manifest.id}_${toolName}`.replace(/[^a-zA-Z0-9_]/g, "_");
          this.toolRegistry.register({
            definition: {
              name: namespaced,
              description: `[Plugin: ${plugin.manifest.id}] Provided tool ${toolName}`,
              parametersSchema: { type: "object", properties: {} },
              isIdempotent: false,
              riskLevel: "medium",
            },
            handler: async (args: any) => ({ status: "success", tool: toolName, output: args }),
          });
          registeredTools.push(namespaced);
        }
      }
    }

    plugin.lifecycleState = "active";
    plugin.healthState = "healthy";
    plugin.lastActivatedAt = new Date().toISOString();
    plugin.activeRegistrations.tools = registeredTools;

    this.emitEvent(EventTypes.PLUGIN_ACTIVATED, {
      pluginId,
      version: plugin.manifest.version,
      tools: registeredTools,
    });

    return plugin;
  }

  /**
   * Disables an active plugin and clears all active registrations without leaving stale references.
   */
  public disable(pluginId: string): PluginRecord {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin "${pluginId}" not found.`);
    }

    // Clear registered tools from ToolRegistry
    if (this.toolRegistry && plugin.activeRegistrations.tools) {
      for (const toolName of plugin.activeRegistrations.tools) {
        this.toolRegistry.unregister(toolName);
      }
    }

    plugin.lifecycleState = "disabled";
    plugin.activeRegistrations = { tools: [], commands: [], hooks: [], providers: [] };

    this.emitEvent(EventTypes.PLUGIN_DISABLED, { pluginId });
    return plugin;
  }

  /**
   * Unloads a plugin releasing all resources and references.
   */
  public unload(pluginId: string): PluginRecord {
    const plugin = this.disable(pluginId);
    plugin.lifecycleState = "unloaded";

    this.emitEvent(EventTypes.PLUGIN_UNLOADED, { pluginId });
    return plugin;
  }

  /**
   * Hot-reloads an installed plugin.
   */
  public reload(pluginId: string): PluginRecord {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin "${pluginId}" not found.`);
    }

    this.unload(pluginId);
    const reactivated = this.activate(pluginId);

    this.emitEvent(EventTypes.PLUGIN_RELOADED, { pluginId, version: reactivated.manifest.version });
    return reactivated;
  }

  /**
   * Updates a plugin to a new version, preserving previous version for rollback.
   */
  public update(newManifest: PluginManifest, packageBytes?: Buffer | string): PluginRecord {
    const existing = this.plugins.get(newManifest.id);
    if (!existing) {
      throw new Error(`Plugin "${newManifest.id}" is not installed. Use install() first.`);
    }

    const previousVersion = {
      manifest: { ...existing.manifest },
      installPath: existing.installPath,
      checksum: existing.manifest.checksum,
    };

    try {
      // Disable active version first
      this.disable(newManifest.id);

      // Install candidate
      const installed = this.installer.install(newManifest, {
        packageBytes,
        installDir: this.installBaseDir,
      });

      installed.previousVersion = previousVersion;
      this.plugins.set(newManifest.id, installed);

      // Activate new version
      const activated = this.activate(newManifest.id);
      this.emitEvent(EventTypes.PLUGIN_UPDATED, {
        pluginId: newManifest.id,
        oldVersion: previousVersion.manifest.version,
        newVersion: newManifest.version,
      });

      return activated;
    } catch (err: any) {
      // Revert to previous version
      this.plugins.set(existing.manifest.id, existing);
      if (existing.lifecycleState === "active") {
        this.activate(existing.manifest.id);
      }
      throw new Error(`Plugin update failed for "${newManifest.id}": ${err.message}. Rolled back.`);
    }
  }

  /**
   * Rollback a plugin to its previous version.
   */
  public rollback(pluginId: string): PluginRecord {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || !plugin.previousVersion) {
      throw new Error(`No rollback version available for plugin "${pluginId}".`);
    }

    const prev = plugin.previousVersion;
    this.disable(pluginId);

    const rolledBackRecord: PluginRecord = PluginRecordSchema.parse({
      manifest: prev.manifest,
      trustState: plugin.trustState,
      lifecycleState: "installed",
      healthState: "healthy",
      installPath: prev.installPath,
      installedAt: new Date().toISOString(),
      activeRegistrations: { tools: [], commands: [], hooks: [], providers: [] },
    });

    this.plugins.set(pluginId, rolledBackRecord);
    const active = this.activate(pluginId);

    this.emitEvent(EventTypes.PLUGIN_ROLLED_BACK, {
      pluginId,
      restoredVersion: prev.manifest.version,
    });

    return active;
  }

  private emitEvent(type: string, payload: Record<string, unknown>): void {
    if (this.eventStore) {
      this.eventStore.append({
        id: `evt_plg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        schemaVersion: 1,
        projectId: this.projectId,
        type,
        actor: "system",
        timestamp: new Date().toISOString(),
        payload,
      });
    }
  }
}
