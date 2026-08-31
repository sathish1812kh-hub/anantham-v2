/**
 * Anantham V2 — Skill Compatibility Checker
 *
 * Validates required model capabilities and runtime version constraints for skills.
 */

import { type SkillMetadata } from "../domain/skill.js";

export interface SkillCompatibilityResult {
  isCompatible: boolean;
  reasons: string[];
}

export class SkillCompatibilityChecker {
  private readonly currentRuntimeVersion: string;

  constructor(options?: { runtimeVersion?: string }) {
    this.currentRuntimeVersion = options?.runtimeVersion || "2.0.0-alpha.1";
  }

  /**
   * Evaluates if a skill is compatible with the given model capabilities and runtime.
   */
  public checkCompatibility(
    metadata: SkillMetadata,
    availableModelCapabilities: string[] = []
  ): SkillCompatibilityResult {
    const reasons: string[] = [];

    // 1. Runtime Version Check
    if (metadata.runtime) {
      const minRuntimeMatch = metadata.runtime.match(/>=\s*(\d+)/);
      if (minRuntimeMatch && minRuntimeMatch[1]) {
        const minMajor = parseInt(minRuntimeMatch[1], 10);
        const currentMajor = parseInt(this.currentRuntimeVersion.split(".")[0] || "2", 10);
        if (currentMajor < minMajor) {
          reasons.push(
            `Incompatible Anantham runtime: Skill requires "${metadata.runtime}", current runtime is "${this.currentRuntimeVersion}".`
          );
        }
      }
    }

    // 2. Model Capabilities Check
    if (metadata.capabilities && metadata.capabilities.length > 0) {
      for (const cap of metadata.capabilities) {
        if (!availableModelCapabilities.includes(cap)) {
          reasons.push(`Missing required model capability: "${cap}".`);
        }
      }
    }

    return {
      isCompatible: reasons.length === 0,
      reasons,
    };
  }
}
