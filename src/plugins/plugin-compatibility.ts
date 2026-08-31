/**
 * Anantham V2 — Plugin Compatibility Checker
 *
 * Evaluates OS platform compatibility, Node version ranges, Anantham runtime version,
 * and required system capabilities.
 */

import { type PluginCompatibility } from "../domain/plugin.js";

export interface CompatibilityCheckResult {
  isCompatible: boolean;
  reasons: string[];
}

export class PluginCompatibilityChecker {
  private readonly currentOs: string;
  private readonly currentNodeVersion: string;
  private readonly currentRuntimeVersion: string;

  constructor(options?: { os?: string; nodeVersion?: string; runtimeVersion?: string }) {
    this.currentOs = options?.os || process.platform;
    this.currentNodeVersion = options?.nodeVersion || process.version;
    this.currentRuntimeVersion = options?.runtimeVersion || "2.0.0-alpha.1";
  }

  /**
   * Evaluates whether a plugin's compatibility constraints are satisfied.
   */
  public checkCompatibility(
    compatibility: Partial<PluginCompatibility> = {},
    availableCapabilities: string[] = []
  ): CompatibilityCheckResult {
    const reasons: string[] = [];

    // 1. OS Compatibility Check
    if (compatibility.os && compatibility.os.length > 0) {
      if (!compatibility.os.includes(this.currentOs as any)) {
        reasons.push(
          `Incompatible OS: Plugin requires [${compatibility.os.join(", ")}], current platform is "${this.currentOs}".`
        );
      }
    }

    // 2. Node Version Check (simple >= constraint check)
    if (compatibility.node) {
      const minNodeMatch = compatibility.node.match(/>=\s*(\d+)/);
      if (minNodeMatch && minNodeMatch[1]) {
        const minMajor = parseInt(minNodeMatch[1], 10);
        const currentMajorMatch = this.currentNodeVersion.match(/v?(\d+)/);
        const currentMajor = currentMajorMatch && currentMajorMatch[1] ? parseInt(currentMajorMatch[1], 10) : 0;
        if (currentMajor < minMajor) {
          reasons.push(
            `Incompatible Node.js version: Plugin requires "${compatibility.node}", current version is "${this.currentNodeVersion}".`
          );
        }
      }
    }

    // 3. Runtime Version Check
    if (compatibility.runtime) {
      const minRuntimeMatch = compatibility.runtime.match(/>=\s*(\d+)/);
      if (minRuntimeMatch && minRuntimeMatch[1]) {
        const minMajor = parseInt(minRuntimeMatch[1], 10);
        const currentMajor = parseInt(this.currentRuntimeVersion.split(".")[0] || "2", 10);
        if (currentMajor < minMajor) {
          reasons.push(
            `Incompatible Anantham runtime: Plugin requires "${compatibility.runtime}", current runtime is "${this.currentRuntimeVersion}".`
          );
        }
      }
    }

    // 4. Required Capabilities Check
    if (compatibility.capabilities && compatibility.capabilities.length > 0) {
      for (const cap of compatibility.capabilities) {
        if (!availableCapabilities.includes(cap)) {
          reasons.push(`Missing required capability: "${cap}".`);
        }
      }
    }

    return {
      isCompatible: reasons.length === 0,
      reasons,
    };
  }
}
