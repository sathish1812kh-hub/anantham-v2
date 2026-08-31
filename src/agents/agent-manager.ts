import { randomUUID } from "node:crypto";
import {
  AgentManifest,
  AgentRecord,
  AgentRuntimeState,
  AgentRuntimeStateSchema,
  AgentStartupPlan,
} from "../domain/agent.js";
import { EventTypes } from "../domain/event.js";
import { EventStore } from "../event-state/event-store.js";
import { AgentRegistry } from "./agent-registry.js";
import {
  AgentResolutionContext,
  AgentStartupResolver,
  ResolutionResult,
} from "./agent-startup-resolver.js";

export interface AgentManagerOptions {
  registry?: AgentRegistry;
  resolver?: AgentStartupResolver;
  eventStore?: EventStore;
}

/**
 * Primary Agent Manager orchestrating agent lifecycles, startup resolution,
 * instance pinning, and durable EventStore audit emissions.
 * PRD Part 2 Section 278, 279.
 */
export class AgentManager {
  private registry: AgentRegistry;
  private resolver: AgentStartupResolver;
  private eventStore?: EventStore;
  private instances = new Map<string, AgentRuntimeState>();

  constructor(options: AgentManagerOptions = {}) {
    this.registry = options.registry || new AgentRegistry();
    this.resolver = options.resolver || new AgentStartupResolver();
    this.eventStore = options.eventStore;
  }

  /**
   * Register a new agent manifest.
   */
  public register(
    manifest: AgentManifest,
    source: AgentRecord["source"] = "project"
  ): AgentRecord {
    const record = this.registry.register(manifest, source);

    this.emitEvent(EventTypes.AGENT_REGISTERED, {
      agentId: record.id,
      version: record.manifest.version,
      role: record.manifest.role,
      scope: record.manifest.scope,
      projectId: record.manifest.projectId || "system",
    });

    return record;
  }

  /**
   * Unregister an agent manifest.
   */
  public unregister(agentId: string): boolean {
    const record = this.registry.get(agentId);
    const success = this.registry.unregister(agentId);
    if (success) {
      this.emitEvent(EventTypes.AGENT_REMOVED, {
        agentId,
        projectId: record?.manifest.projectId || "system",
      });
    }
    return success;
  }

  /**
   * Get an agent definition record.
   */
  public get(agentId: string): AgentRecord | undefined {
    return this.registry.get(agentId);
  }

  /**
   * List registered agent definitions.
   */
  public list(projectId?: string): AgentRecord[] {
    return this.registry.list(projectId);
  }

  /**
   * Execute deterministic 10-step startup resolution for an agent.
   */
  public resolveStartup(
    agentId: string,
    context: AgentResolutionContext
  ): ResolutionResult {
    const record = this.registry.get(agentId);
    if (!record) {
      this.emitEvent(EventTypes.AGENT_FAILED, {
        agentId,
        projectId: context.projectId,
        sessionId: context.sessionId,
        taskId: context.taskId,
        error: `Agent "${agentId}" is not registered`,
      });
      return {
        success: false,
        errorCode: "AGENT_NOT_FOUND",
        errorMessage: `Agent "${agentId}" is not registered`,
      };
    }

    // Check project isolation
    if (
      record.manifest.scope === "project" &&
      record.manifest.projectId &&
      record.manifest.projectId !== context.projectId
    ) {
      this.emitEvent(EventTypes.AGENT_BLOCKED, {
        agentId,
        projectId: context.projectId,
        reason: "PROJECT_ISOLATION_VIOLATION",
      });
      return {
        success: false,
        errorCode: "PROJECT_ISOLATION_VIOLATION",
        errorMessage: `Agent "${agentId}" belongs to project "${record.manifest.projectId}" and cannot be accessed from "${context.projectId}"`,
      };
    }

    this.emitEvent(EventTypes.AGENT_RESOLVING, {
      agentId,
      projectId: context.projectId,
      sessionId: context.sessionId,
      taskId: context.taskId,
    });

    const result = this.resolver.resolve(record.manifest, context);

    if (result.success && result.startupPlan) {
      this.registry.updateStatus(agentId, "ready");
      this.emitEvent(EventTypes.AGENT_READY, {
        agentId,
        planId: result.startupPlan.planId,
        model: result.startupPlan.resolvedModel.modelId,
        projectId: context.projectId,
        sessionId: context.sessionId,
        taskId: context.taskId,
      });
    } else {
      this.registry.updateStatus(agentId, "failed");
      this.emitEvent(EventTypes.AGENT_FAILED, {
        agentId,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        projectId: context.projectId,
        sessionId: context.sessionId,
        taskId: context.taskId,
      });
    }

    return result;
  }

  /**
   * Create an active runtime instance pinned to a resolved startup plan.
   */
  public createInstance(startupPlan: AgentStartupPlan): AgentRuntimeState {
    const instanceId = `inst_${randomUUID()}`;

    const runtimeState: AgentRuntimeState = {
      instanceId,
      agentId: startupPlan.agentId,
      startupPlan,
      status: "running",
      tokensConsumed: 0,
      costUsdConsumed: 0,
      toolCallsExecuted: 0,
      startedAt: new Date().toISOString(),
    };

    AgentRuntimeStateSchema.parse(runtimeState);
    this.instances.set(instanceId, runtimeState);

    this.emitEvent(EventTypes.AGENT_STARTED, {
      instanceId,
      agentId: startupPlan.agentId,
      planId: startupPlan.planId,
      projectId: startupPlan.projectId,
      sessionId: startupPlan.sessionId,
      taskId: startupPlan.taskId,
    });

    return runtimeState;
  }

  /**
   * Retrieve active instance state.
   */
  public getInstance(instanceId: string): AgentRuntimeState | undefined {
    return this.instances.get(instanceId);
  }

  /**
   * List active runtime instances.
   */
  public listInstances(agentId?: string): AgentRuntimeState[] {
    const all = Array.from(this.instances.values());
    if (agentId) {
      return all.filter((inst) => inst.agentId === agentId);
    }
    return all;
  }

  /**
   * Stop an active runtime instance.
   */
  public stopInstance(instanceId: string): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance) return false;

    instance.status = "stopped";
    instance.completedAt = new Date().toISOString();

    this.emitEvent(EventTypes.AGENT_STOPPED, {
      instanceId,
      agentId: instance.agentId,
      planId: instance.startupPlan.planId,
      projectId: instance.startupPlan.projectId,
      sessionId: instance.startupPlan.sessionId,
      taskId: instance.startupPlan.taskId,
    });

    return true;
  }

  /**
   * Record resource consumption on an active instance.
   */
  public recordConsumption(
    instanceId: string,
    tokens = 0,
    costUsd = 0,
    toolCalls = 0
  ): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance) return false;

    instance.tokensConsumed += tokens;
    instance.costUsdConsumed += costUsd;
    instance.toolCallsExecuted += toolCalls;
    return true;
  }

  /**
   * Emit audit events to EventStore.
   */
  private emitEvent(type: string, payload: Record<string, unknown>): void {
    if (!this.eventStore) return;
    try {
      this.eventStore.append({
        id: `evt_${randomUUID()}`,
        schemaVersion: 1,
        type,
        actor: "system",
        projectId: (payload.projectId as string) || "system",
        sessionId: payload.sessionId ? (payload.sessionId as string) : undefined,
        taskId: payload.taskId ? (payload.taskId as string) : undefined,
        payload,
        timestamp: new Date().toISOString(),
      });
    } catch {
      // EventStore logging must not crash primary execution
    }
  }
}
