/**
 * Anantham V2 — Hook Registry
 *
 * Authoritative registry managing registered, enabled, and project-scoped hooks.
 */

import {
  type HookRecord,
  type HookManifest,
  HookRecordSchema,
  HookManifestSchema,
} from "../domain/hook.js";

export class HookRegistry {
  private readonly hooks = new Map<string, HookRecord>();

  public register(
    manifest: HookManifest,
    source: "system" | "project" | "plugin" = "project"
  ): HookRecord {
    const validatedManifest = HookManifestSchema.parse(manifest);

    const record: HookRecord = HookRecordSchema.parse({
      id: validatedManifest.id,
      manifest: validatedManifest,
      lifecycleState: validatedManifest.enabled ? "enabled" : "disabled",
      source,
      registeredAt: new Date().toISOString(),
    });

    this.hooks.set(validatedManifest.id, record);
    return record;
  }

  public unregister(hookId: string): boolean {
    return this.hooks.delete(hookId);
  }

  public get(hookId: string): HookRecord | undefined {
    return this.hooks.get(hookId);
  }

  public has(hookId: string): boolean {
    return this.hooks.has(hookId);
  }

  public list(projectId?: string): HookRecord[] {
    const all = Array.from(this.hooks.values());
    if (!projectId) {
      return all;
    }
    return all.filter(
      (h) => h.manifest.scope === "global" || h.manifest.projectId === projectId
    );
  }

  public enable(hookId: string): HookRecord {
    const record = this.hooks.get(hookId);
    if (!record) {
      throw new Error(`Hook "${hookId}" not found.`);
    }
    record.lifecycleState = "enabled";
    record.manifest.enabled = true;
    return record;
  }

  public disable(hookId: string): HookRecord {
    const record = this.hooks.get(hookId);
    if (!record) {
      throw new Error(`Hook "${hookId}" not found.`);
    }
    record.lifecycleState = "disabled";
    record.manifest.enabled = false;
    return record;
  }

  public clear(): void {
    this.hooks.clear();
  }
}
