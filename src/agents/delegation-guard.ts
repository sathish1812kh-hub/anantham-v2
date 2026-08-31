import { AgentRuntimeState, AgentStartupPlan } from "../domain/agent.js";
import { DelegationRequest } from "../domain/team.js";

export interface DelegationValidationResult {
  valid: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface DelegationGuardOptions {
  maxDepth?: number;
  maxChildren?: number;
}

/**
 * Delegation Guard enforcing hierarchy depth bounds, fan-out limits,
 * anti-privilege escalation, and budget containment.
 * PRD Part 2 Section 38, Section 39.
 */
export class DelegationGuard {
  private readonly maxDepth: number;
  private readonly maxChildren: number;

  constructor(options?: DelegationGuardOptions) {
    this.maxDepth = options?.maxDepth ?? 4;
    this.maxChildren = options?.maxChildren ?? 8;
  }

  public validateDelegation(
    parentInstance: AgentRuntimeState,
    parentPlan: AgentStartupPlan,
    request: DelegationRequest,
    currentChildCount: number
  ): DelegationValidationResult {
    // 1. Parent status check
    if (parentInstance.status !== "running" && parentInstance.status !== "ready") {
      return {
        valid: false,
        errorCode: "PARENT_NOT_RUNNING",
        errorMessage: `Parent agent instance "${parentInstance.instanceId}" is in state "${parentInstance.status}" and cannot delegate`,
      };
    }

    // 2. Delegation Depth Check
    const currentDepth = (parentPlan.metadata?.delegationDepth as number) ?? 0;
    if (currentDepth >= this.maxDepth) {
      return {
        valid: false,
        errorCode: "MAX_DELEGATION_DEPTH_EXCEEDED",
        errorMessage: `Cannot delegate. Current depth is ${currentDepth}, max allowed depth is ${this.maxDepth}`,
      };
    }

    // 3. Active Children Fan-Out Check
    if (currentChildCount >= this.maxChildren) {
      return {
        valid: false,
        errorCode: "MAX_CHILDREN_EXCEEDED",
        errorMessage: `Parent instance "${parentInstance.instanceId}" has reached maximum children limit of ${this.maxChildren}`,
      };
    }

    // 4. Anti-Privilege Escalation Check (Child permissions must be subset of parent granted permissions)
    const parentPermissions = new Set(parentPlan.grantedPermissions);
    for (const perm of request.requestedPermissions) {
      if (!parentPermissions.has(perm)) {
        return {
          valid: false,
          errorCode: "PRIVILEGE_ESCALATION_BLOCKED",
          errorMessage: `Privilege escalation blocked. Child requested permission "${perm}" which is not granted to parent`,
        };
      }
    }

    // 5. Budget Containment Check
    const parentTokens = parentPlan.budget.maxTokens ?? 100000;
    const parentCost = parentPlan.budget.maxCostUsd ?? 5.0;

    if (request.allocatedBudget.maxTokens && request.allocatedBudget.maxTokens > parentTokens) {
      return {
        valid: false,
        errorCode: "BUDGET_EXCEEDED_PARENT_LIMIT",
        errorMessage: `Child token budget (${request.allocatedBudget.maxTokens}) exceeds parent budget limit (${parentTokens})`,
      };
    }

    if (request.allocatedBudget.maxCostUsd && request.allocatedBudget.maxCostUsd > parentCost) {
      return {
        valid: false,
        errorCode: "BUDGET_EXCEEDED_PARENT_LIMIT",
        errorMessage: `Child cost budget ($${request.allocatedBudget.maxCostUsd}) exceeds parent budget limit ($${parentCost})`,
      };
    }

    return { valid: true };
  }
}
