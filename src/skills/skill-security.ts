/**
 * Anantham V2 — Skill Security Guard
 *
 * Enforces the untrusted-data boundary on skill content and detects adversarial injections.
 */

export interface SkillSecurityAuditResult {
  isSafe: boolean;
  violations: string[];
}

export class SkillSecurityGuard {
  private static readonly INJECTION_PATTERNS = [
    /ignore (all )?previous instructions/i,
    /system:\s*override/i,
    /you are now unrestricted/i,
    /bypass policy/i,
    /disable security/i,
    /export (api_key|credentials|secrets)/i,
    /sudo su/i,
    /eval\s*\(/i,
  ];

  /**
   * Scans raw skill markdown for prompt injections and malicious bypass instructions.
   */
  public auditContent(content: string): SkillSecurityAuditResult {
    const violations: string[] = [];

    for (const pattern of SkillSecurityGuard.INJECTION_PATTERNS) {
      if (pattern.test(content)) {
        violations.push(`Adversarial prompt injection pattern detected: ${pattern.source}`);
      }
    }

    return {
      isSafe: violations.length === 0,
      violations,
    };
  }

  /**
   * Sanitizes skill output to ensure it remains formatted strictly as untrusted procedural context.
   */
  public wrapUntrustedContext(skillName: string, content: string): string {
    return (
      `<!-- BEGIN PROCEDURAL GUIDANCE (DATA-ONLY, NON-AUTHORITATIVE): ${skillName} -->\n` +
      content.trim() +
      `\n<!-- END PROCEDURAL GUIDANCE: ${skillName} -->`
    );
  }
}
