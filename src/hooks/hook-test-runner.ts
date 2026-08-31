/**
 * Anantham V2 — Hook Test Runner
 *
 * Deterministic fixture test harness for hooks (/hooks test <id>).
 */

import { type HookRecord, type HookExecutionResult, type HookTriggerType } from "../domain/hook.js";
import { HookExecutor } from "./hook-executor.js";

export interface HookTestFixture {
  id: string;
  hookId: string;
  triggerEvent: HookTriggerType;
  inputPayload?: Record<string, unknown>;
  expectedDecision?: "allow" | "deny" | "modify" | "executed" | "skipped";
  expectedSuccess?: boolean;
}

export interface HookTestReport {
  fixtureId: string;
  hookId: string;
  passed: boolean;
  durationMs: number;
  result: HookExecutionResult;
  assertions: Array<{ assertion: string; passed: boolean; error?: string }>;
}

export class HookTestRunner {
  private readonly executor: HookExecutor;

  constructor(options?: { executor?: HookExecutor }) {
    this.executor = options?.executor || new HookExecutor();
  }

  /**
   * Runs a deterministic test fixture against a target hook.
   */
  public async runTest(hook: HookRecord, fixture: HookTestFixture): Promise<HookTestReport> {
    const startTime = Date.now();
    const assertions: Array<{ assertion: string; passed: boolean; error?: string }> = [];

    const result = await this.executor.execute(hook, {
      event: fixture.triggerEvent,
      payload: fixture.inputPayload,
    });

    // 1. Assert success match
    if (fixture.expectedSuccess !== undefined) {
      const match = result.success === fixture.expectedSuccess;
      assertions.push({
        assertion: `Hook success matches expected (${fixture.expectedSuccess})`,
        passed: match,
        error: match ? undefined : `Expected success=${fixture.expectedSuccess}, got ${result.success}`,
      });
    }

    // 2. Assert decision match
    if (fixture.expectedDecision) {
      const match = result.decision === fixture.expectedDecision;
      assertions.push({
        assertion: `Hook decision matches expected ("${fixture.expectedDecision}")`,
        passed: match,
        error: match ? undefined : `Expected decision="${fixture.expectedDecision}", got "${result.decision}"`,
      });
    }

    const durationMs = Date.now() - startTime;
    const passed = assertions.every((a) => a.passed);

    return {
      fixtureId: fixture.id,
      hookId: hook.id,
      passed,
      durationMs,
      result,
      assertions,
    };
  }
}
