import { normalize, resolve } from "node:path";
import type { Artifact } from "../domain/artifact.js";

export interface ArtifactAccessContext {
  requestProjectId?: string;
  requestSessionId?: string;
  allowCrossProject?: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  reason?: string;
}

export class ArtifactReferenceValidator {
  /**
   * Validates that an artifact storage path does not escape the designated base directory.
   * Defends against path traversal, absolute path injection, and directory climbing.
   * PRD Part 3 Section 138.
   */
  public static validateStoragePath(filePath: string, allowedBaseDir: string): ValidationResult {
    if (!filePath) {
      return { isValid: false, reason: "Storage path cannot be empty." };
    }

    const normalizedBase = resolve(normalize(allowedBaseDir));
    const normalizedTarget = resolve(normalize(filePath));

    if (!normalizedTarget.startsWith(normalizedBase)) {
      return {
        isValid: false,
        reason: `Path traversal detected: target '${filePath}' escapes base directory '${allowedBaseDir}'.`,
      };
    }

    return { isValid: true };
  }

  /**
   * Validates whether a caller in a given project context can access the artifact.
   */
  public static validateAccess(artifact: Artifact, context?: ArtifactAccessContext): ValidationResult {
    if (!context) {
      return { isValid: true };
    }

    // Cross-project boundary enforcement
    if (context.requestProjectId && artifact.projectId) {
      if (context.requestProjectId !== artifact.projectId && !context.allowCrossProject) {
        return {
          isValid: false,
          reason: `Cross-project access denied: artifact belongs to project '${artifact.projectId}' but was requested from project '${context.requestProjectId}'.`,
        };
      }
    }

    return { isValid: true };
  }
}
