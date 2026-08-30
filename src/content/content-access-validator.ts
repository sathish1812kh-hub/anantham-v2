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

  /**
   * Enforces that sensitivity downgrades (e.g. secret -> public) cannot be performed
   * by untrusted actors or without explicit elevated permissions.
   * PRD Part 3 Section 139.
   */
  public static validateClassificationTransition(
    currentSensitivity: SensitivityLevel,
    newSensitivity: SensitivityLevel,
    actorTrust: TrustLevel = "user-content"
  ): AccessValidationResult {
    const currentLevel = ContentAccessValidator.SENSITIVITY_HIERARCHY[currentSensitivity];
    const newLevel = ContentAccessValidator.SENSITIVITY_HIERARCHY[newSensitivity];

    // Sensitivity Escalation (e.g. normal -> sensitive) is always permitted for security hardening
    if (newLevel >= currentLevel) {
      return { allowed: true };
    }

    // Sensitivity Downgrade (e.g. secret -> public) is strictly forbidden for untrusted / normal user actors
    if (actorTrust === "untrusted" || actorTrust === "user-content" || actorTrust === "web-content") {
      return {
        allowed: false,
        reason: `Unauthorized sensitivity downgrade: untrusted actor with trust '${actorTrust}' cannot downgrade sensitivity from '${currentSensitivity}' to '${newSensitivity}'.`,
      };
    }

    return { allowed: true };
  }

  /**
   * Verifies strict cross-project boundary isolation.
   * Content originating in Project A cannot be accessed in Project B unless explicitly public.
   */
  public static verifyProjectIsolation(
    content: ContentObject,
    contextProjectId: string,
    contentProjectId?: string
  ): AccessValidationResult {
    if (!contentProjectId || !contextProjectId) {
      return { allowed: true };
    }

    if (contentProjectId !== contextProjectId) {
      if (content.security.sensitivity !== "public") {
        return {
          allowed: false,
          reason: `Cross-project access violation: content owned by project '${contentProjectId}' cannot be accessed from project '${contextProjectId}'.`,
        };
      }
    }

    return { allowed: true };
  }
}
