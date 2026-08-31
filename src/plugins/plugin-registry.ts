/**
 * Anantham V2 — Plugin Registry
 *
 * Authoritative registry managing plugin installations, project-level version pinning,
 * and discovery across projects.
 */

import {
  type PluginRecord,
  type PluginPinMap,
  PluginPinMapSchema,
} from "../domain/plugin.js";
import { PluginManager } from "./plugin-manager.js";

export class PluginRegistry {
  private readonly manager: PluginManager;
  private readonly projectPins = new Map<string, PluginPinMap>();

  constructor(manager?: PluginManager) {
    this.manager = manager || new PluginManager();
  }

  public getManager(): PluginManager {
    return this.manager;
  }

  /**
   * Sets project-level plugin version locks.
   */
  public setProjectPins(projectId: string, pins: PluginPinMap): void {
    const validated = PluginPinMapSchema.parse(pins);
    this.projectPins.set(projectId, validated);
  }

  public getProjectPins(projectId: string): PluginPinMap {
    return this.projectPins.get(projectId) || {};
  }

  /**
   * Retrieves effective plugin for a project respecting version pinning.
   */
  public getEffectivePlugin(pluginId: string, projectId?: string): PluginRecord | undefined {
    const plugin = this.manager.getPlugin(pluginId);
    if (!plugin) return undefined;

    if (projectId) {
      const pins = this.getProjectPins(projectId);
      const pinnedVersion = pins[pluginId];
      if (pinnedVersion && plugin.manifest.version !== pinnedVersion) {
        // Pinned version differs from currently active global version
        return {
          ...plugin,
          projectPin: pinnedVersion,
        };
      }
    }

    return plugin;
  }
}
