/**
 * Anantham V2 — Skill Progressive Loader
 *
 * Implements three-phase progressive disclosure: Metadata -> Relevance match -> Full procedure body.
 */

import { type SkillManifest, type SkillMetadata } from "../domain/skill.js";
import { SkillRelevanceMatcher, type SkillMatchCandidate } from "./skill-matcher.js";
import { SkillCompatibilityChecker } from "./skill-compatibility.js";
import { SkillDependencyResolver } from "./skill-dependency.js";

export interface ProgressiveLoadOptions {
  taskGoal: string;
  availableCapabilities?: string[];
  maxTokens?: number;
  minRelevanceScore?: number;
}

export interface LoadedSkillContext {
  skillId: string;
  version: string;
  name: string;
  procedurePrompt: string;
  tokenEstimate: number;
}

export class SkillProgressiveLoader {
  private readonly matcher: SkillRelevanceMatcher;
  private readonly compatibilityChecker: SkillCompatibilityChecker;
  private readonly dependencyResolver: SkillDependencyResolver;
  private readonly bodyCache = new Map<string, string>();

  constructor(options?: {
    matcher?: SkillRelevanceMatcher;
    compatibilityChecker?: SkillCompatibilityChecker;
    dependencyResolver?: SkillDependencyResolver;
  }) {
    this.matcher = options?.matcher || new SkillRelevanceMatcher();
    this.compatibilityChecker = options?.compatibilityChecker || new SkillCompatibilityChecker();
    this.dependencyResolver = options?.dependencyResolver || new SkillDependencyResolver();
  }

  /**
   * Clears derived body cache (for cache safety on disable/reload).
   */
  public invalidateCache(skillId?: string): void {
    if (skillId) {
      this.bodyCache.delete(skillId);
    } else {
      this.bodyCache.clear();
    }
  }

  /**
   * Evaluates task goal and progressively loads only relevant, compatible skills into context.
   */
  public loadRelevantSkills(
    installedManifests: SkillManifest[],
    options: ProgressiveLoadOptions
  ): {
    matched: SkillMatchCandidate[];
    loaded: LoadedSkillContext[];
    skipped: Array<{ skillId: string; reason: string }>;
  } {
    const allMetadataMap = new Map<string, SkillMetadata>();
    for (const m of installedManifests) {
      allMetadataMap.set(m.metadata.id, m.metadata);
    }

    // Phase 1 & 2: Match relevant skills using cheap metadata
    const candidates = this.matcher.match(
      options.taskGoal,
      installedManifests.map((m) => m.metadata),
      { minScore: options.minRelevanceScore || 0.1 }
    );

    const loaded: LoadedSkillContext[] = [];
    const skipped: Array<{ skillId: string; reason: string }> = [];
    let currentTokens = 0;
    const maxTokens = options.maxTokens || 4000;

    for (const cand of candidates) {
      const manifest = installedManifests.find((m) => m.metadata.id === cand.metadata.id);
      if (!manifest) continue;

      // Phase 3: Validate compatibility
      const compat = this.compatibilityChecker.checkCompatibility(
        manifest.metadata,
        options.availableCapabilities || []
      );
      if (!compat.isCompatible) {
        skipped.push({ skillId: manifest.metadata.id, reason: compat.reasons.join(" ") });
        continue;
      }

      // Phase 3: Validate dependencies
      const depRes = this.dependencyResolver.resolveDependencies(
        manifest.metadata,
        allMetadataMap
      );
      if (!depRes.isResolved) {
        skipped.push({ skillId: manifest.metadata.id, reason: depRes.errors.join(" ") });
        continue;
      }

      // Format procedure for prompt injection
      const procedurePrompt = this.formatProcedurePrompt(manifest);
      const tokenEstimate = Math.ceil(procedurePrompt.length / 4);

      if (currentTokens + tokenEstimate > maxTokens) {
        skipped.push({
          skillId: manifest.metadata.id,
          reason: `Token budget exceeded (${currentTokens + tokenEstimate} > ${maxTokens}).`,
        });
        continue;
      }

      this.bodyCache.set(manifest.metadata.id, procedurePrompt);
      currentTokens += tokenEstimate;
      loaded.push({
        skillId: manifest.metadata.id,
        version: manifest.metadata.version,
        name: manifest.metadata.name,
        procedurePrompt,
        tokenEstimate,
      });
    }

    return { matched: candidates, loaded, skipped };
  }

  private formatProcedurePrompt(manifest: SkillManifest): string {
    const meta = manifest.metadata;
    const proc = manifest.procedure;

    let output = `### SKILL: ${meta.name} (v${meta.version})\n`;
    output += `*Description*: ${meta.description}\n\n`;

    if (proc.preconditions && proc.preconditions.length > 0) {
      output += `**Preconditions**:\n`;
      for (const pre of proc.preconditions) output += `- ${pre}\n`;
      output += `\n`;
    }

    if (proc.steps && proc.steps.length > 0) {
      output += `**Procedure**:\n`;
      proc.steps.forEach((step, idx) => {
        output += `${idx + 1}. ${step}\n`;
      });
      output += `\n`;
    }

    if (proc.successCriteria && proc.successCriteria.length > 0) {
      output += `**Success Criteria**:\n`;
      for (const crit of proc.successCriteria) output += `- ${crit}\n`;
      output += `\n`;
    }

    return output.trim();
  }
}
