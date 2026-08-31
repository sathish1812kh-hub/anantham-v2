/**
 * Anantham V2 — Plugin Dependency Resolver
 *
 * Resolves multi-plugin dependency graphs, validates version constraints,
 * and detects cyclic or missing dependencies.
 */

import { type PluginManifest, type PluginDependency } from "../domain/plugin.js";

export interface DependencyResolutionResult {
  isResolved: boolean;
  resolutionOrder: string[];
  missingDependencies: Array<{ pluginId: string; dependency: PluginDependency }>;
  incompatibleVersions: Array<{ pluginId: string; required: string; available: string }>;
  cyclicDependencies: string[][];
  errors: string[];
}

export class PluginDependencyResolver {
  /**
   * Resolves dependency graph for a collection of plugin manifests.
   */
  public resolve(
    targetManifests: PluginManifest[],
    installedManifests: PluginManifest[] = []
  ): DependencyResolutionResult {
    const allManifestsMap = new Map<string, PluginManifest>();
    for (const m of installedManifests) {
      allManifestsMap.set(m.id, m);
    }
    for (const m of targetManifests) {
      allManifestsMap.set(m.id, m);
    }

    const missingDependencies: Array<{ pluginId: string; dependency: PluginDependency }> = [];
    const incompatibleVersions: Array<{ pluginId: string; required: string; available: string }> = [];
    const cyclicDependencies: string[][] = [];

    // 1. Check for missing and incompatible dependencies
    for (const manifest of allManifestsMap.values()) {
      for (const dep of manifest.dependencies || []) {
        const target = allManifestsMap.get(dep.id);
        if (!target) {
          if (!dep.optional) {
            missingDependencies.push({ pluginId: manifest.id, dependency: dep });
          }
          continue;
        }

        // SemVer matching
        if (!this.matchesVersion(target.version, dep.version)) {
          incompatibleVersions.push({
            pluginId: manifest.id,
            required: `${dep.id}@${dep.version}`,
            available: target.version,
          });
        }
      }
    }

    // 2. Cycle Detection & Topological Sort
    const visited = new Map<string, "visiting" | "visited">();
    const resolutionOrder: string[] = [];

    const dfs = (pluginId: string, path: string[]) => {
      if (visited.get(pluginId) === "visiting") {
        const cycleStartIndex = path.indexOf(pluginId);
        cyclicDependencies.push([...path.slice(cycleStartIndex), pluginId]);
        return;
      }
      if (visited.get(pluginId) === "visited") {
        return;
      }

      visited.set(pluginId, "visiting");
      const current = allManifestsMap.get(pluginId);
      if (current) {
        for (const dep of current.dependencies || []) {
          if (allManifestsMap.has(dep.id)) {
            dfs(dep.id, [...path, pluginId]);
          }
        }
      }
      visited.set(pluginId, "visited");
      resolutionOrder.push(pluginId);
    };

    for (const id of allManifestsMap.keys()) {
      if (!visited.has(id)) {
        dfs(id, []);
      }
    }

    const compiledErrors: string[] = [];
    for (const missing of missingDependencies) {
      compiledErrors.push(`Plugin "${missing.pluginId}" missing required dependency "${missing.dependency.id}".`);
    }
    for (const incomp of incompatibleVersions) {
      compiledErrors.push(`Plugin "${incomp.pluginId}" incompatible version: requires "${incomp.required}", available is "${incomp.available}".`);
    }
    for (const cycle of cyclicDependencies) {
      compiledErrors.push(`Cyclic dependency detected: ${cycle.join(" -> ")}.`);
    }

    return {
      isResolved: compiledErrors.length === 0,
      resolutionOrder,
      missingDependencies,
      incompatibleVersions,
      cyclicDependencies,
      errors: compiledErrors,
    };
  }

  private matchesVersion(actual: string, required: string): boolean {
    if (required === "*" || required === actual) return true;

    const caretMatch = required.match(/^\^(\d+)\.(\d+)\.(\d+)/);
    if (caretMatch && caretMatch[1]) {
      const reqMajor = caretMatch[1];
      const actualMajor = actual.split(".")[0];
      return reqMajor === actualMajor;
    }

    const gteMatch = required.match(/^>=\s*(\d+)\.(\d+)\.(\d+)/);
    if (gteMatch && gteMatch[1] && gteMatch[2] && gteMatch[3]) {
      const reqMajor = parseInt(gteMatch[1], 10);
      const reqMinor = parseInt(gteMatch[2], 10);
      const reqPatch = parseInt(gteMatch[3], 10);
      const [actMajor = 0, actMinor = 0, actPatch = 0] = actual.split(".").map((n) => parseInt(n, 10));
      if (actMajor > reqMajor) return true;
      if (actMajor === reqMajor) {
        if (actMinor > reqMinor) return true;
        if (actMinor === reqMinor) {
          return actPatch >= reqPatch;
        }
      }
      return false;
    }

    return actual === required;
  }
}
