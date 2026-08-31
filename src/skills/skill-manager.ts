/**
 * Anantham V2 — Skill Manager & Lifecycle Engine
 *
 * Coordinates full skill lifecycle transitions, progressive loading, testing,
 * execution provenance recording, and EventStore auditing.
 */

import {
  type SkillRecord,
  type SkillTestFixture,
  type SkillTestResult,
  type SkillExecutionRecord,
  SkillExecutionRecordSchema,
} from "../domain/skill.js";
import { SkillParser } from "./skill-parser.js";
import { SkillRegistry } from "./skill-registry.js";
import { SkillProgressiveLoader, type ProgressiveLoadOptions, type LoadedSkillContext } from "./skill-loader.js";
import { SkillTestRunner } from "./skill-test-runner.js";
import { SkillSecurityGuard } from "./skill-security.js";
import { type EventStore } from "../event-state/event-store.js";
import { EventTypes } from "../domain/event.js";

export interface SkillManagerOptions {
  registry?: SkillRegistry;
  parser?: SkillParser;
  loader?: SkillProgressiveLoader;
  testRunner?: SkillTestRunner;
  securityGuard?: SkillSecurityGuard;
  eventStore?: EventStore;
  projectId?: string;
}

export class SkillManager {
  private readonly registry: SkillRegistry;
  private readonly parser: SkillParser;
  private readonly loader: SkillProgressiveLoader;
  private readonly testRunner: SkillTestRunner;
  private readonly securityGuard: SkillSecurityGuard;
  private readonly eventStore?: EventStore;
  private readonly projectId: string;

  constructor(options: SkillManagerOptions = {}) {
    this.registry = options.registry || new SkillRegistry();
    this.parser = options.parser || new SkillParser();
    this.loader = options.loader || new SkillProgressiveLoader();
    this.testRunner = options.testRunner || new SkillTestRunner();
    this.securityGuard = options.securityGuard || new SkillSecurityGuard();
    this.eventStore = options.eventStore;
    this.projectId = options.projectId || "global";
  }

  public getRegistry(): SkillRegistry {
    return this.registry;
  }

  /**
   * Discovers and parses a SKILL.md document.
   */
  public discover(rawContent: string, fallbackId?: string): SkillRecord {
    const manifest = this.parser.parse(rawContent, fallbackId);
    const record = this.registry.register(manifest);
    record.lifecycleState = "discovered";

    this.emitEvent(EventTypes.SKILL_DISCOVERED, {
      skillId: manifest.metadata.id,
      version: manifest.metadata.version,
    });

    return record;
  }

  /**
   * Installs and validates a SKILL.md document.
   */
  public install(rawContent: string, fallbackId?: string): SkillRecord {
    const audit = this.securityGuard.auditContent(rawContent);
    if (!audit.isSafe) {
      throw new Error(`Skill security validation failed: ${audit.violations.join(" ")}`);
    }

    const manifest = this.parser.parse(rawContent, fallbackId);
    const record = this.registry.register(manifest);
    record.lifecycleState = "enabled";

    this.emitEvent(EventTypes.SKILL_INSTALLED, {
      skillId: manifest.metadata.id,
      version: manifest.metadata.version,
    });

    return record;
  }

  /**
   * Enables an installed skill.
   */
  public enable(skillId: string): SkillRecord {
    const record = this.registry.get(skillId);
    if (!record) {
      throw new Error(`Skill "${skillId}" not found in registry.`);
    }

    record.lifecycleState = "enabled";
    this.loader.invalidateCache(skillId);

    this.emitEvent(EventTypes.SKILL_ENABLED, { skillId });
    return record;
  }

  /**
   * Disables a skill and invalidates derived caches.
   */
  public disable(skillId: string): SkillRecord {
    const record = this.registry.get(skillId);
    if (!record) {
      throw new Error(`Skill "${skillId}" not found in registry.`);
    }

    record.lifecycleState = "disabled";
    this.loader.invalidateCache(skillId);

    this.emitEvent(EventTypes.SKILL_DISABLED, { skillId });
    return record;
  }

  /**
   * Reloads a skill from updated SKILL.md content, invalidating cache.
   */
  public reload(skillId: string, updatedRawContent: string): SkillRecord {
    const record = this.registry.get(skillId);
    if (!record) {
      throw new Error(`Skill "${skillId}" not found for reload.`);
    }

    const audit = this.securityGuard.auditContent(updatedRawContent);
    if (!audit.isSafe) {
      throw new Error(`Skill security validation failed during reload: ${audit.violations.join(" ")}`);
    }

    const updatedManifest = this.parser.parse(updatedRawContent, skillId);
    record.manifest = updatedManifest;
    record.lifecycleState = "enabled";
    this.loader.invalidateCache(skillId);

    this.emitEvent(EventTypes.SKILL_RELOADED, {
      skillId,
      version: updatedManifest.metadata.version,
    });

    return record;
  }

  /**
   * Removes a skill from the registry.
   */
  public remove(skillId: string): boolean {
    const deleted = this.registry.unregister(skillId);
    if (deleted) {
      this.loader.invalidateCache(skillId);
      this.emitEvent(EventTypes.SKILL_REMOVED, { skillId });
    }
    return deleted;
  }

  /**
   * Progressively loads relevant skills for a task goal.
   */
  public loadForTask(options: ProgressiveLoadOptions): LoadedSkillContext[] {
    const enabledManifests = this.registry
      .list()
      .filter((r) => r.lifecycleState === "enabled" || r.lifecycleState === "loaded")
      .map((r) => r.manifest);

    const result = this.loader.loadRelevantSkills(enabledManifests, options);
    for (const loaded of result.loaded) {
      this.emitEvent(EventTypes.SKILL_LOADED, {
        skillId: loaded.skillId,
        version: loaded.version,
        tokens: loaded.tokenEstimate,
      });
    }

    return result.loaded;
  }

  /**
   * Runs deterministic skill test fixtures (/skills test <name>).
   */
  public async test(skillId: string, fixture: SkillTestFixture): Promise<SkillTestResult> {
    const record = this.registry.get(skillId);
    if (!record) {
      throw new Error(`Skill "${skillId}" not found for testing.`);
    }

    const result = await this.testRunner.runTest(record.manifest, fixture);

    this.emitEvent(EventTypes.SKILL_TESTED, {
      skillId,
      passed: result.passed,
      durationMs: result.durationMs,
    });

    return result;
  }

  /**
   * Records execution provenance when a skill procedure is completed.
   */
  public recordExecution(
    skillId: string,
    context: {
      projectId?: string;
      sessionId?: string;
      taskId?: string;
      contextRevision?: number;
      toolsUsed?: string[];
      mcpUsed?: string[];
      result?: string;
    }
  ): SkillExecutionRecord {
    const record = this.registry.get(skillId);
    const version = record ? record.manifest.metadata.version : "unknown";

    const executionRecord: SkillExecutionRecord = SkillExecutionRecordSchema.parse({
      id: `exec_sk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      skillId,
      version,
      projectId: context.projectId || this.projectId,
      sessionId: context.sessionId,
      taskId: context.taskId,
      contextRevision: context.contextRevision,
      toolsUsed: context.toolsUsed || [],
      mcpUsed: context.mcpUsed || [],
      result: context.result || "success",
      timestamp: new Date().toISOString(),
    });

    this.emitEvent(EventTypes.SKILL_EXECUTED, {
      skillId,
      version,
      taskId: context.taskId,
      result: executionRecord.result,
    });

    return executionRecord;
  }

  private emitEvent(type: string, payload: Record<string, unknown>): void {
    if (this.eventStore) {
      this.eventStore.append({
        id: `evt_sk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        schemaVersion: 1,
        projectId: this.projectId,
        type,
        actor: "system",
        timestamp: new Date().toISOString(),
        payload,
      });
    }
  }
}
