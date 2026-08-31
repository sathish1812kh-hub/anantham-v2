/**
 * Anantham V2 — Hook Manager & Lifecycle Engine
 *
 * Coordinates hook registration, trigger evaluation, deterministic execution,
 * recursion protection, and SQLite WAL EventStore audit emission.
 */

import {
  type HookRecord,
  type HookManifest,
  type HookExecutionResult,
  type HookTriggerType,
} from "../domain/hook.js";
import { HookRegistry } from "./hook-registry.js";
import { HookMatcher, type HookMatchContext } from "./hook-matcher.js";
import { HookRecursionGuard } from "./hook-recursion-guard.js";
import { HookExecutor, type HookExecutionContext } from "./hook-executor.js";
import { HookSecurityGuard } from "./hook-security.js";
import { HookTestRunner, type HookTestFixture, type HookTestReport } from "./hook-test-runner.js";
import { type EventStore } from "../event-state/event-store.js";
import { EventTypes } from "../domain/event.js";

export interface HookManagerOptions {
  registry?: HookRegistry;
  matcher?: HookMatcher;
  recursionGuard?: HookRecursionGuard;
  executor?: HookExecutor;
  securityGuard?: HookSecurityGuard;
  testRunner?: HookTestRunner;
  eventStore?: EventStore;
  projectId?: string;
}

export class HookManager {
  private readonly registry: HookRegistry;
  private readonly matcher: HookMatcher;
  private readonly recursionGuard: HookRecursionGuard;
  private readonly executor: HookExecutor;
  private readonly securityGuard: HookSecurityGuard;
  private readonly testRunner: HookTestRunner;
  private readonly eventStore?: EventStore;
  private readonly projectId: string;

  constructor(options: HookManagerOptions = {}) {
    this.registry = options.registry || new HookRegistry();
    this.matcher = options.matcher || new HookMatcher();
    this.recursionGuard = options.recursionGuard || new HookRecursionGuard();
    this.executor = options.executor || new HookExecutor();
    this.securityGuard = options.securityGuard || new HookSecurityGuard();
    this.testRunner = options.testRunner || new HookTestRunner({ executor: this.executor });
    this.eventStore = options.eventStore;
    this.projectId = options.projectId || "global";
  }

  public getRegistry(): HookRegistry {
    return this.registry;
  }

  public register(
    manifest: HookManifest,
    source: "system" | "project" | "plugin" = "project"
  ): HookRecord {
    const audit = this.securityGuard.audit(manifest);
    if (!audit.isSafe) {
      throw new Error(`Hook security audit failed: ${audit.violations.join(" ")}`);
    }

    const record = this.registry.register(manifest, source);

    this.emitEvent(EventTypes.HOOK_REGISTERED, {
      hookId: record.id,
      event: record.manifest.event,
      source,
    });

    return record;
  }

  public unregister(hookId: string): boolean {
    const deleted = this.registry.unregister(hookId);
    if (deleted) {
      this.emitEvent(EventTypes.HOOK_REMOVED, { hookId });
    }
    return deleted;
  }

  public enable(hookId: string): HookRecord {
    const record = this.registry.enable(hookId);
    this.emitEvent(EventTypes.HOOK_ENABLED, { hookId });
    return record;
  }

  public disable(hookId: string): HookRecord {
    const record = this.registry.disable(hookId);
    this.emitEvent(EventTypes.HOOK_DISABLED, { hookId });
    return record;
  }

  public get(hookId: string): HookRecord | undefined {
    return this.registry.get(hookId);
  }

  public list(projectId?: string): HookRecord[] {
    return this.registry.list(projectId);
  }

  /**
   * Evaluates and executes all matching hooks for a lifecycle trigger event.
   * Returns whether execution is blocked (due to fail-closed error).
   */
  public async handleEvent(context: {
    event: HookTriggerType;
    projectId?: string;
    sessionId?: string;
    taskId?: string;
    payload?: Record<string, unknown>;
    causationId?: string;
    depth?: number;
  }): Promise<{
    matchedCount: number;
    results: HookExecutionResult[];
    isBlocked: boolean;
  }> {
    const currentDepth = context.depth || 0;
    const matchContext: HookMatchContext = {
      event: context.event,
      projectId: context.projectId || this.projectId,
      payload: context.payload,
    };

    const allHooks = this.registry.list(context.projectId || this.projectId);
    const matched = this.matcher.match(allHooks, matchContext);

    const results: HookExecutionResult[] = [];
    let isBlocked = false;

    for (const hook of matched) {
      // Recursion & cascade check
      const recCheck = this.recursionGuard.check(hook.id, context.causationId, currentDepth);
      if (!recCheck.allowed) {
        const skippedResult: HookExecutionResult = {
          hookId: hook.id,
          event: context.event,
          actionType: hook.manifest.action.type,
          success: false,
          decision: "skipped",
          durationMs: 0,
          error: recCheck.reason,
          isFailClosedBlocked: hook.manifest.policy.onFailure === "fail-closed",
          timestamp: new Date().toISOString(),
        };
        results.push(skippedResult);
        if (skippedResult.isFailClosedBlocked) isBlocked = true;
        continue;
      }

      this.recursionGuard.enter(hook.id, context.causationId);
      this.emitEvent(EventTypes.HOOK_TRIGGERED, {
        hookId: hook.id,
        event: context.event,
      });

      try {
        const execContext: HookExecutionContext = {
          event: context.event,
          projectId: context.projectId || this.projectId,
          sessionId: context.sessionId,
          taskId: context.taskId,
          payload: context.payload,
          depth: currentDepth + 1,
        };

        const res = await this.executor.execute(hook, execContext);
        results.push(res);

        if (res.isFailClosedBlocked) {
          isBlocked = true;
          this.emitEvent(EventTypes.HOOK_BLOCKED, {
            hookId: hook.id,
            reason: res.error || "Blocked by hook policy",
          });
        }

        if (res.success) {
          this.emitEvent(EventTypes.HOOK_COMPLETED, {
            hookId: hook.id,
            durationMs: res.durationMs,
          });
        } else {
          this.emitEvent(EventTypes.HOOK_FAILED, {
            hookId: hook.id,
            error: res.error,
          });
        }
      } finally {
        this.recursionGuard.exit(hook.id, context.causationId);
      }
    }

    return {
      matchedCount: matched.length,
      results,
      isBlocked,
    };
  }

  /**
   * Deterministically tests a hook with a fixture (/hooks test <id>).
   */
  public async test(hookId: string, fixture: HookTestFixture): Promise<HookTestReport> {
    const record = this.registry.get(hookId);
    if (!record) {
      throw new Error(`Hook "${hookId}" not found for testing.`);
    }
    return this.testRunner.runTest(record, fixture);
  }

  private emitEvent(type: string, payload: Record<string, unknown>): void {
    if (this.eventStore) {
      this.eventStore.append({
        id: `evt_hk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
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
