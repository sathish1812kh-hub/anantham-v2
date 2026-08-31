/**
 * Anantham V2 — Plugin Permissions Manager
 *
 * Enforces declared permission boundaries (network hosts, filesystem scopes, credentials, tools)
 * and policy review checks.
 */

import { type PluginPermissions } from "../domain/plugin.js";
import { type PolicyEngine } from "../policy/policy-engine.js";

export interface PermissionReviewResult {
  isGranted: boolean;
  grantedPermissions: PluginPermissions;
  deniedPermissions: string[];
  requiresApproval: boolean;
}

export class PluginPermissionsManager {
  public readonly policyEngine?: PolicyEngine;

  constructor(options?: { policyEngine?: PolicyEngine }) {
    this.policyEngine = options?.policyEngine;
  }

  /**
   * Reviews requested permissions and checks for restricted operations.
   */
  public reviewPermissions(
    requested: Partial<PluginPermissions> = {},
    trustState: "unknown" | "reviewed" | "trusted" | "restricted" | "blocked" = "unknown"
  ): PermissionReviewResult {
    const fullPermissions: PluginPermissions = {
      network: requested.network || [],
      filesystem: requested.filesystem || { read: [], write: [] },
      credentials: requested.credentials || [],
      tools: requested.tools || [],
      subprocess: Boolean(requested.subprocess),
    };

    const denied: string[] = [];
    let requiresApproval = false;

    if (trustState === "blocked") {
      return {
        isGranted: false,
        grantedPermissions: fullPermissions,
        deniedPermissions: ["Plugin is BLOCKED by administrator policy."],
        requiresApproval: false,
      };
    }

    // High risk checks: subprocess execution
    if (fullPermissions.subprocess) {
      if (trustState !== "trusted") {
        requiresApproval = true;
      }
    }

    // High risk checks: credential access
    if (fullPermissions.credentials && fullPermissions.credentials.length > 0) {
      if (trustState !== "trusted") {
        requiresApproval = true;
      }
    }

    // Filesystem write checks
    if (fullPermissions.filesystem?.write && fullPermissions.filesystem.write.length > 0) {
      for (const p of fullPermissions.filesystem.write) {
        if (p.startsWith("/") || p.startsWith("C:\\") || p.includes("..")) {
          denied.push(`Root or traversing filesystem write path "${p}" is forbidden.`);
        }
      }
    }

    return {
      isGranted: denied.length === 0,
      grantedPermissions: fullPermissions,
      deniedPermissions: denied,
      requiresApproval,
    };
  }

  /**
   * Validates if a network host is permitted by the plugin's declared permissions.
   */
  public isHostPermitted(host: string, permissions: PluginPermissions): boolean {
    if (!permissions.network || permissions.network.length === 0) {
      return false;
    }
    const cleanHost = (host.toLowerCase().split(":")[0] || "").trim();
    if (!cleanHost) return false;

    return permissions.network.some((allowed) => {
      if (allowed === "*") return true;
      const cleanAllowed = (allowed.toLowerCase().split(":")[0] || "").trim();
      return cleanAllowed === cleanHost || cleanHost.endsWith(`.${cleanAllowed}`);
    });
  }
}
