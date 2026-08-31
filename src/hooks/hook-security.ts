/**
 * Anantham V2 — Hook Security Guard
 *
 * Enforces policy boundaries on hook manifests, detects adversarial patterns,
 * and prevents privilege escalation or security bypass attempts.
 */

import { type HookManifest } from "../domain/hook.js";

export interface HookSecurityAuditResult {
  isSafe: boolean;
  violations: string[];
}

export class HookSecurityGuard {
  private static readonly DANGEROUS_COMMAND_PATTERNS = [
    /sudo\s+/i,
    /rm\s+-rf\s+\//i,
    /chmod\s+777/i,
    /bypass[_\-\s]?policy/i,
    /disable[_\-\s]?security/i,
    /export\s+(api_key|secret|token)/i,
    /eval\s*\(/i,
  ];

  /**
   * Scans a hook manifest for security violations and forbidden commands.
   */
  public audit(manifest: HookManifest): HookSecurityAuditResult {
    const violations: string[] = [];

    // 1. Audit command if present
    if (manifest.action.command) {
      for (const pattern of HookSecurityGuard.DANGEROUS_COMMAND_PATTERNS) {
        if (pattern.test(manifest.action.command)) {
          violations.push(
            `Forbidden dangerous command pattern detected: ${pattern.source}`
          );
        }
      }
    }

    // 2. Audit message / context for prompt injection patterns
    const textToScan = `${manifest.action.message || ""} ${manifest.action.context || ""}`;
    if (textToScan.trim()) {
      if (/ignore (all )?previous instructions/i.test(textToScan)) {
        violations.push("Prompt injection pattern detected in hook action text.");
      }
    }

    // 3. Size check on action parameters / context
    const serializedAction = JSON.stringify(manifest.action);
    if (serializedAction.length > 64 * 1024) {
      violations.push(`Hook action payload exceeds size limit (64KB max).`);
    }

    return {
      isSafe: violations.length === 0,
      violations,
    };
  }
}
