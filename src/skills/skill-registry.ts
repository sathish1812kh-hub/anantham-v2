/**
 * Anantham V2 — Skill Registry
 *
 * Authoritative registry managing skill metadata, version locks, project-scoped pinning,
 * and active status.
 */

import {
  type SkillRecord,
  type SkillManifest,
  type SkillPinMap,
  SkillRecordSchema,
  SkillPinMapSchema,
} from "../domain/skill.js";

export class SkillRegistry {
  private readonly skills = new Map<string, SkillRecord>();
  private readonly projectPins = new Map<string, SkillPinMap>();

  public register(manifest: SkillManifest, installPath?: string): SkillRecord {
    const record: SkillRecord = SkillRecordSchema.parse({
      id: manifest.metadata.id,
      manifest,
      trustState: "unknown",
      lifecycleState: "installed",
      installPath,
      installedAt: new Date().toISOString(),
    });

    this.skills.set(manifest.metadata.id, record);
    return record;
  }

  public unregister(skillId: string): boolean {
    return this.skills.delete(skillId);
  }

  public get(skillId: string): SkillRecord | undefined {
    return this.skills.get(skillId);
  }

  public list(): SkillRecord[] {
    return Array.from(this.skills.values());
  }

  public has(skillId: string): boolean {
    return this.skills.has(skillId);
  }

  /**
   * Pins skill versions for a specific project.
   */
  public setProjectPins(projectId: string, pins: SkillPinMap): void {
    const validated = SkillPinMapSchema.parse(pins);
    this.projectPins.set(projectId, validated);
  }

  public getProjectPins(projectId: string): SkillPinMap {
    return this.projectPins.get(projectId) || {};
  }

  /**
   * Retrieves effective skill for a project, applying project pinning.
   */
  public getEffectiveSkill(skillId: string, projectId?: string): SkillRecord | undefined {
    const record = this.skills.get(skillId);
    if (!record) return undefined;

    if (projectId) {
      const pins = this.getProjectPins(projectId);
      const pinnedVersion = pins[skillId];
      if (pinnedVersion && record.manifest.metadata.version !== pinnedVersion) {
        return {
          ...record,
          projectPin: pinnedVersion,
        };
      }
    }

    return record;
  }
}
