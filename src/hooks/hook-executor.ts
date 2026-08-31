/**
 * Anantham V2 — Hook Executor
 *
 * Executes bounded hook actions via ToolGateway, enforcing timeouts, retries,
 * and error policies (fail-closed, fail-open, warn).
 */

import {
  type HookRecord,
  type HookExecutionResult,
  type HookTriggerType,
  HookExecutionResultSchema,
} from "../domain/hook.js";
import { type ToolGateway } from "../tools/tool-gateway.js";

export interface HookExecutionContext {
  event: HookTriggerType;
  projectId?: string;
  sessionId?: string;
  taskId?: string;
  payload?: Record<string, unknown>;
  depth?: number;
}

export class HookExecutor {
  private readonly toolGateway?: ToolGateway;

  constructor(options?: { toolGateway?: ToolGateway }) {
    this.toolGateway = options?.toolGateway;
  }

  /**
   * Executes a single hook action within a bounded timeout and retry context.
   */
  public async execute(
    hook: HookRecord,
    context: HookExecutionContext
  ): Promise<HookExecutionResult> {
    const startTime = Date.now();
    const manifest = hook.manifest;
    const action = manifest.action;
    const policy = manifest.policy;

    let attempts = 0;
    const maxRetries = policy.maxRetries || 0;
    let lastError: Error | undefined;

    while (attempts <= maxRetries) {
      attempts++;
      try {
        const timeoutMs = policy.timeoutMs || 5000;
        const resultOutput = await this.executeWithTimeout(
          async () => this.runAction(action, context),
          timeoutMs
        );

        const durationMs = Date.now() - startTime;
        return HookExecutionResultSchema.parse({
          hookId: hook.id,
          event: context.event,
          actionType: action.type,
          success: true,
          decision: action.type === "deny" ? "deny" : action.type === "modify" ? "modify" : "executed",
          durationMs,
          output: resultOutput,
          isFailClosedBlocked: action.type === "deny",
          timestamp: new Date().toISOString(),
        });
      } catch (err: any) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempts <= maxRetries) {
          // Bounded retry backoff
          await new Promise((resolve) => setTimeout(resolve, 20 * attempts));
        }
      }
    }

    const durationMs = Date.now() - startTime;
    const isFailClosed = policy.onFailure === "fail-closed";

    return HookExecutionResultSchema.parse({
      hookId: hook.id,
      event: context.event,
      actionType: action.type,
      success: false,
      decision: "skipped",
      durationMs,
      error: lastError?.message || "Unknown hook execution error",
      isFailClosedBlocked: isFailClosed,
      timestamp: new Date().toISOString(),
    });
  }

  private async runAction(
    action: HookRecord["manifest"]["action"],
    context: HookExecutionContext
  ): Promise<unknown> {
    switch (action.type) {
      case "allow":
        return { allowed: true };

      case "deny":
        return { allowed: false, reason: action.message || "Denied by hook policy." };

      case "modify":
        return { modified: true, payload: { ...context.payload, ...action.parameters } };

      case "add_context":
        return { addedContext: action.context || action.message || "" };

      case "create_artifact":
        return { artifactCreated: action.artifact };

      case "notify":
        return { notified: true, message: action.message };

      case "command":
      case "tool": {
        const toolName = action.tool || (action.type === "command" ? "shell.execute" : "unknown.tool");
        const toolParams = action.type === "command" ? { command: action.command } : action.parameters;

        if (this.toolGateway) {
          const obs = await this.toolGateway.invoke({
            callId: `call_hk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            toolName,
            arguments: toolParams || {},
            actor: {
              id: "system:hook",
              type: "system",
            },
            project: {
              id: context.projectId || "global",
            },
            session: context.sessionId ? { id: context.sessionId } : undefined,
            task: context.taskId ? { id: context.taskId } : undefined,
          });
          if (obs.status !== "success") {
            throw new Error(obs.error?.message || `Tool execution status: ${obs.status}`);
          }
          return obs.result;
        }

        // Mock deterministic command execution if ToolGateway is omitted
        return { executedTool: toolName, parameters: toolParams };
      }

      default:
        return { executed: true };
    }
  }

  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Hook execution timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      fn()
        .then((res) => {
          clearTimeout(timer);
          resolve(res);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}
