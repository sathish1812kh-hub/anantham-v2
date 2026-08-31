/**
 * Anantham V2 — Plugin Doctor Diagnostics
 *
 * Implements comprehensive system diagnostics for plugins (/plugins doctor).
 */

import { PluginManager } from "./plugin-manager.js";

export interface PluginDiagnosticReport {
  pluginId: string;
  name: string;
  version: string;
  trustState: string;
  lifecycleState: string;
  healthState: string;
  isHealthy: boolean;
  issues: string[];
}

export class PluginDoctor {
  private readonly manager: PluginManager;

  constructor(manager: PluginManager) {
    this.manager = manager;
  }

  public diagnosePlugin(pluginId: string): PluginDiagnosticReport {
    const plugin = this.manager.getPlugin(pluginId);
    if (!plugin) {
      return {
        pluginId,
        name: "Unknown",
        version: "0.0.0",
        trustState: "unknown",
        lifecycleState: "failed",
        healthState: "failed",
        isHealthy: false,
        issues: [`Plugin "${pluginId}" is not registered.`],
      };
    }

    const issues: string[] = [];

    if (plugin.trustState === "blocked") {
      issues.push("Plugin is marked as BLOCKED.");
    }

    if (plugin.healthState === "unhealthy" || plugin.healthState === "failed") {
      issues.push(`Plugin health is currently ${plugin.healthState}.`);
    }

    if (plugin.lifecycleState === "failed") {
      issues.push("Plugin lifecycle state is FAILED.");
    }

    return {
      pluginId: plugin.manifest.id,
      name: plugin.manifest.name,
      version: plugin.manifest.version,
      trustState: plugin.trustState,
      lifecycleState: plugin.lifecycleState,
      healthState: plugin.healthState,
      isHealthy: issues.length === 0,
      issues,
    };
  }

  public diagnoseAll(): PluginDiagnosticReport[] {
    const all = this.manager.listPlugins();
    return all.map((p) => this.diagnosePlugin(p.manifest.id));
  }
}
