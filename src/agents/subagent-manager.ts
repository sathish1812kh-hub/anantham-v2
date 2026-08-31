import { randomUUID } from "node:crypto";
import { AgentRuntimeState, AgentStartupPlan, AgentStartupPlanSchema } from "../domain/agent.js";
import { DelegationRequest, DelegationResult } from "../domain/team.js";
import { EventTypes } from "../domain/event.js";
import { EventStore } from "../event-state/event-store.js";
import { AgentManager } from "./agent-manager.js";
import { AgentRegistry } from "./agent-registry.js";
import { DelegationGuard } from "./delegation-guard.js";
import { LeaseRepository } from "../persistence/repositories/lease-repository.js";

export interface SubagentManagerOptions {
  agentManager: AgentManager;
  agentRegistry: AgentRegistry;
  delegationGuard?: DelegationGuard;
  eventStore?: EventStore;
  leaseRepo?: LeaseRepository;
}

/**
 * Subagent Manager coordinating bounded hierarchical delegation,
 * parent/child lifecycles, and cancellation propagation.
 * PRD Part 2 Section 38, Section 40.
 */
export class SubagentManager {
  private readonly agentManager: AgentManager;
  private readonly agentRegistry?: AgentRegistry;
  private readonly delegationGuard: DelegationGuard;
  private readonly eventStore?: EventStore;
  private readonly leaseRepo?: LeaseRepository;

  // parentInstanceId -> Set of childInstanceIds
  private readonly parentToChildren = new Map<string, Set<string>>();
  // childInstanceId -> parentInstanceId
  private readonly childToParent = new Map<string, string>();

  constructor(options: SubagentManagerOptions) {
    this.agentManager = options.agentManager;
    this.agentRegistry = options.agentRegistry;
    this.delegationGuard = options.delegationGuard ?? new DelegationGuard();
    this.eventStore = options.eventStore;
    this.leaseRepo = options.leaseRepo;
  }

  public getRegistry(): AgentRegistry | undefined {
    return this.agentRegistry;
  }

  public getLeaseRepo(): LeaseRepository | undefined {
    return this.leaseRepo;
  }

  /**
   * Delegate task/objective to a bounded subagent.
   * PRD Part 2 Section 38.
   */
  public delegate(request: DelegationRequest): DelegationResult {
    // 1. Fetch parent instance
    const parentInstance = this.agentManager.getInstance(request.parentInstanceId);
    if (!parentInstance) {
      return {
        success: false,
        errorCode: "PARENT_INSTANCE_NOT_FOUND",
        errorMessage: `Parent agent instance "${request.parentInstanceId}" not found`,
      };
    }

    // 2. Fetch parent startup plan
    const parentPlan = parentInstance.startupPlan;
    if (!parentPlan) {
      return {
        success: false,
        errorCode: "PARENT_PLAN_NOT_FOUND",
        errorMessage: `Parent startup plan not found on instance "${request.parentInstanceId}"`,
      };
    }

    // 3. Count active children
    const activeChildren = this.getActiveChildCount(request.parentInstanceId);

    // 4. Guard check (depth, fan-out, permissions, budget)
    const guardRes = this.delegationGuard.validateDelegation(
      parentInstance,
      parentPlan,
      request,
      activeChildren
    );

    if (!guardRes.valid) {
      return {
        success: false,
        errorCode: guardRes.errorCode,
        errorMessage: guardRes.errorMessage,
      };
    }

    // 5. Construct bounded child startup plan
    const parentDepth = (parentPlan.metadata?.delegationDepth as number) ?? 0;
    const childDepth = parentDepth + 1;

    const childPlanId = `plan_sub_${randomUUID()}`;
    const childBudget = {
      maxTokens: request.allocatedBudget.maxTokens ?? parentPlan.budget.maxTokens,
      maxCostUsd: request.allocatedBudget.maxCostUsd ?? parentPlan.budget.maxCostUsd,
      maxToolCalls: request.allocatedBudget.maxToolCalls ?? parentPlan.budget.maxToolCalls,
      maxDurationSeconds: request.allocatedBudget.maxDurationSeconds ?? parentPlan.budget.maxDurationSeconds,
    };

    const childPlan: AgentStartupPlan = {
      planId: childPlanId,
      agentId: request.childAgentId,
      version: "1.0.0",
      role: request.childRole,
      objective: request.childObjective,
      resolvedModel: parentPlan.resolvedModel,
      resolvedCapabilities: request.requestedCapabilities.length > 0
        ? request.requestedCapabilities
        : parentPlan.resolvedCapabilities,
      resolvedTools: request.requestedTools.length > 0
        ? request.requestedTools
        : parentPlan.resolvedTools,
      resolvedSkills: request.requestedSkills.length > 0
        ? request.requestedSkills
        : parentPlan.resolvedSkills,
      grantedPermissions: request.requestedPermissions.filter((p) =>
        parentPlan.grantedPermissions.includes(p)
      ),
      executor: parentPlan.executor,
      contextScope: {
        ...parentPlan.contextScope,
        ...request.contextScope,
      },
      memoryScope: {
        ...parentPlan.memoryScope,
        namespace: `agent:${request.childAgentId}`,
        ...request.memoryScope,
      },
      budget: childBudget,
      projectId: parentPlan.projectId, // Strictly locked to parent project
      sessionId: parentPlan.sessionId,
      resolvedAt: new Date().toISOString(),
      metadata: {
        parentAgentId: request.parentAgentId,
        parentInstanceId: request.parentInstanceId,
        delegationDepth: childDepth,
        taskId: request.taskId,
      },
    };

    AgentStartupPlanSchema.parse(childPlan);

    // 6. Spawn child instance
    const childInstance = this.agentManager.createInstance(childPlan);

    // 7. Track hierarchy
    if (!this.parentToChildren.has(request.parentInstanceId)) {
      this.parentToChildren.set(request.parentInstanceId, new Set());
    }
    this.parentToChildren.get(request.parentInstanceId)!.add(childInstance.instanceId);
    this.childToParent.set(childInstance.instanceId, request.parentInstanceId);

    // 8. Emit durable events
    this.emitEvent(EventTypes.SUBAGENT_SPAWNED, {
      parentAgentId: request.parentAgentId,
      parentInstanceId: request.parentInstanceId,
      childAgentId: request.childAgentId,
      childInstanceId: childInstance.instanceId,
      delegationDepth: childDepth,
      projectId: parentPlan.projectId,
      sessionId: parentPlan.sessionId,
      taskId: request.taskId,
    });

    this.emitEvent(EventTypes.SUBAGENT_DELEGATED, {
      parentInstanceId: request.parentInstanceId,
      childInstanceId: childInstance.instanceId,
      role: request.childRole,
      objective: request.childObjective,
      projectId: parentPlan.projectId,
      sessionId: parentPlan.sessionId,
      taskId: request.taskId,
    });

    return {
      success: true,
      childPlan,
      childInstanceId: childInstance.instanceId,
    };
  }

  /**
   * Recursively cancel an agent instance and all its active descendant subagents.
   * PRD Part 2 Section 40.
   */
  public propagateCancellation(parentInstanceId: string): string[] {
    const cancelledInstanceIds: string[] = [];
    const queue: string[] = [parentInstanceId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      cancelledInstanceIds.push(currentId);

      // Stop instance
      this.agentManager.stopInstance(currentId);

      // Find children
      const children = this.parentToChildren.get(currentId);
      if (children) {
        for (const childId of children) {
          queue.push(childId);
        }
      }
    }

    return cancelledInstanceIds;
  }

  /**
   * Get all direct child instances for a parent.
   */
  public getChildInstances(parentInstanceId: string): AgentRuntimeState[] {
    const childIds = this.parentToChildren.get(parentInstanceId);
    if (!childIds) return [];

    const instances: AgentRuntimeState[] = [];
    for (const childId of childIds) {
      const instance = this.agentManager.getInstance(childId);
      if (instance) instances.push(instance);
    }
    return instances;
  }

  private getActiveChildCount(parentInstanceId: string): number {
    const childIds = this.parentToChildren.get(parentInstanceId);
    if (!childIds) return 0;

    let activeCount = 0;
    for (const childId of childIds) {
      const instance = this.agentManager.getInstance(childId);
      if (instance && (instance.status === "running" || instance.status === "ready")) {
        activeCount++;
      }
    }
    return activeCount;
  }

  private emitEvent(type: string, payload: Record<string, unknown>): void {
    if (!this.eventStore) return;
    try {
      this.eventStore.append({
        id: `evt_${randomUUID()}`,
        schemaVersion: 1,
        type,
        actor: "agent",
        projectId: (payload.projectId as string) || "system",
        sessionId: payload.sessionId ? (payload.sessionId as string) : undefined,
        taskId: payload.taskId ? (payload.taskId as string) : undefined,
        agentId: payload.childAgentId ? (payload.childAgentId as string) : (payload.parentAgentId as string),
        payload,
        timestamp: new Date().toISOString(),
      });
    } catch {
      // EventStore failure must not crash execution
    }
  }
}
