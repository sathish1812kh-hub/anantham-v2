import type { ContentObject } from "../domain/content.js";
import type { TrustLevel, SensitivityLevel } from "../domain/security.js";

export interface AccessRequestContext {
  projectId?: string;
  sessionId?: string;
  actorTrust?: TrustLevel;
  actorSensitivityClearance?: SensitivityLevel;
}

export interface AccessValidationResult {
  allowed: boolean;
  reason?: string;
}

export class ContentAccessValidator {
  private static readonly SENSITIVITY_HIERARCHY: Record<SensitivityLevel, number> = {
    public: 0,
    normal: 1,
    sensitive: 2,
    secret: 3,
  };

  /**
   * Validates whether a request context is permitted to access a ContentObject.
   * PRD Part 1 Section 14 & PRD Part 3 Security Architecture.
   */
  public static verifyAccess(
    content: ContentObject,
    context: AccessRequestContext
  ): AccessValidationResult {
    // 1. Secret / Restricted Content requires matching clearance
    const requiredLevel = ContentAccessValidator.SENSITIVITY_HIERARCHY[content.security.sensitivity];
    const actorLevel = ContentAccessValidator.SENSITIVITY_HIERARCHY[context.actorSensitivityClearance || "normal"];

    if (actorLevel < requiredLevel) {
      return {
        allowed: false,
        reason: `Access denied: content sensitivity '${content.security.sensitivity}' exceeds actor clearance '${context.actorSensitivityClearance || "normal"}'.`,
      };
    }

    // 2. Untrusted actors cannot access internal / sensitive / secret content
    if (context.actorTrust === "untrusted" && content.security.sensitivity !== "public") {
      return {
        allowed: false,
        reason: "Access denied: untrusted actors are restricted to public content only.",
      };
    }

    return { allowed: true };
  }
}
