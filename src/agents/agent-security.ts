import { AgentManifest } from "../domain/agent.js";

/**
 * Security guard for Agent definitions, privilege validation, and injection filtering.
 * PRD Part 3 Section 94.
 */
export class AgentSecurityGuard {
  private static readonly INJECTION_PATTERNS = [
    /ignore\s+all\s+(previous|prior)\s+instructions/i,
    /system\s+override/i,
    /bypass\s+(all\s+)?(policy|policies|security|rules)/i,
    /disable\s+(safety|guards|toolgateway|checks)/i,
    /escalate\s+privileges/i,
    /<script[\s\S]*?>[\s\S]*?<\/script>/i,
  ];

  private static readonly DISALLOWED_PERMISSIONS = [
    "root",
    "policy:bypass",
    "security:admin",
    "all:unrestricted",
  ];

  /**
   * Validate agent manifest for prompt injection, disallowed permissions, or privilege escalation.
   */
  public static validateManifest(manifest: AgentManifest): { isValid: boolean; error?: string } {
    // 1. Check prompt injection in objective and role
    const textToCheck = `${manifest.role} ${manifest.objective}`;
    for (const pattern of this.INJECTION_PATTERNS) {
      if (pattern.test(textToCheck)) {
        return {
          isValid: false,
          error: `Agent manifest contains disallowed adversarial prompt pattern matching: ${pattern}`,
        };
      }
    }

    // 2. Check disallowed permissions
    if (this.DISALLOWED_PERMISSIONS.includes(manifest.permissionProfile.toLowerCase())) {
      return {
        isValid: false,
        error: `Agent requested prohibited permission profile: "${manifest.permissionProfile}"`,
      };
    }

    return { isValid: true };
  }
}
