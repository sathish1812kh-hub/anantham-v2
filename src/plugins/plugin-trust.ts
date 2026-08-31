/**
 * Anantham V2 — Plugin Trust Manager
 *
 * Implements deterministic trust state transitions and prevents self-promotion.
 */

import { type PluginTrustState } from "../domain/plugin.js";

export class PluginTrustManager {
  private readonly trustMap = new Map<string, PluginTrustState>();

  constructor(initialTrust?: Record<string, PluginTrustState>) {
    if (initialTrust) {
      for (const [id, state] of Object.entries(initialTrust)) {
        this.trustMap.set(id, state);
      }
    }
  }

  public getTrust(pluginId: string): PluginTrustState {
    return this.trustMap.get(pluginId) || "unknown";
  }

  /**
   * Promotes or changes plugin trust state.
   * Invariant: Requires explicit caller authority (cannot be invoked by plugin code).
   */
  public setTrust(pluginId: string, newState: PluginTrustState, caller: string): void {
    if (caller === "plugin") {
      throw new Error(`Permission Denied: Plugin "${pluginId}" cannot self-promote its trust state.`);
    }

    this.trustMap.set(pluginId, newState);
  }

  public isBlocked(pluginId: string): boolean {
    return this.getTrust(pluginId) === "blocked";
  }

  public isTrusted(pluginId: string): boolean {
    return this.getTrust(pluginId) === "trusted";
  }
}
