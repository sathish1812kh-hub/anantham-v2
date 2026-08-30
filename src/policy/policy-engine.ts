import {
  type PolicyDecision,
  type PolicyEvaluationContext,
  type PolicyRule,
  type RiskLevel,
  PolicyDecisionSchema,
  PolicyEvaluationContextSchema,
} from "../domain/policy.js";
import { RiskClassifier } from "./risk-classifier.js";

export interface PolicyEngineOptions {
  policyVersion?: string;
  rules?: PolicyRule[];
  defaultApprovalOnHighRisk?: boolean;
}

export class PolicyEngine {
  public readonly policyVersion: string;
  private readonly rules: PolicyRule[];
  private readonly defaultApprovalOnHighRisk: boolean;

  constructor(options: PolicyEngineOptions = {}) {
    this.policyVersion = options.policyVersion || "1.0.0";
    this.rules = [...(options.rules || [])].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    this.defaultApprovalOnHighRisk = options.defaultApprovalOnHighRisk ?? true;
  }

  /**
   * Evaluates an operation request deterministically against invariants, rules, and risk tiers.
   * PRD Part 1 Section 34-39 & PRD Part 3 Section 146-150.
   */
  public evaluate(context: PolicyEvaluationContext): PolicyDecision {
    const evaluatedAt = new Date().toISOString();

    // 0. Fail-Closed validation of incoming context
    const parsed = PolicyEvaluationContextSchema.safeParse(context);
    if (!parsed.success) {
      return PolicyDecisionSchema.parse({
        decision: "deny",
        riskLevel: "critical",
        reason: `Fail-closed: Malformed policy evaluation context: ${parsed.error.message}`,
        evaluatedAt,
        policyVersion: this.policyVersion,
      });
    }

    const ctx = parsed.data;

    // 1. SYSTEM INVARIANT 1: Strict Cross-Project Isolation
    if (
      ctx.operation.targetProjectId &&
      ctx.operation.targetProjectId !== ctx.project.id
    ) {
      return PolicyDecisionSchema.parse({
        decision: "deny",
        riskLevel: "critical",
        reason: `Cross-project isolation breach: Actor from project "${ctx.project.id}" attempted unauthorized access to project "${ctx.operation.targetProjectId}".`,
        evaluatedAt,
        policyVersion: this.policyVersion,
      });
    }

    // 2. SYSTEM INVARIANT 2: Zero Raw Credential / Secret Exposure to Untrusted Actors or Models
    const toolName = (ctx.operation.toolName || ctx.operation.type || "").toLowerCase();
    if (
      toolName.includes("secret") ||
      toolName.includes("credential") ||
      ctx.dataSensitivity === "secret"
    ) {
      if (ctx.actor.type !== "user" && ctx.actor.type !== "system") {
        return PolicyDecisionSchema.parse({
          decision: "deny",
          riskLevel: "critical",
          reason: `Security invariant: Raw credential or secret data access prohibited for actor type "${ctx.actor.type}".`,
          evaluatedAt,
          policyVersion: this.policyVersion,
        });
      }
    }

    // 3. SYSTEM INVARIANT 3: Sensitivity Clearance Check
    if (ctx.dataSensitivity === "sensitive" && ctx.actor.type === "mcp") {
      return PolicyDecisionSchema.parse({
        decision: "deny",
        riskLevel: "high",
        reason: `Sensitivity violation: MCP actor is not authorized to access sensitive classified data.`,
        evaluatedAt,
        policyVersion: this.policyVersion,
      });
    }

    // Determine deterministic risk
    const classifiedRisk: RiskLevel = RiskClassifier.classify({
      type: ctx.operation.type,
      toolName: ctx.operation.toolName,
      resource: ctx.operation.resource,
      arguments: ctx.operation.arguments,
      targetProjectId: ctx.operation.targetProjectId,
      sourceProjectId: ctx.project.id,
    });
    const evaluatedRisk: RiskLevel = ctx.requestedRiskLevel || classifiedRisk;

    // 4. PRECEDENCE TIER 2: Explicit Configured Policy Rules
    for (const rule of this.rules) {
      if (this.matchesRule(rule, ctx)) {
        return PolicyDecisionSchema.parse({
          decision: rule.effect,
          riskLevel: rule.riskLevel || evaluatedRisk,
          reason: `Policy rule matched: [${rule.ruleId}] ${rule.reason}`,
          ruleId: rule.ruleId,
          evaluatedAt,
          policyVersion: this.policyVersion,
        });
      }
    }

    // 5. PRECEDENCE TIER 3: Default Risk & Actor-Based Evaluation
    if (ctx.actor.type === "user" || ctx.actor.type === "system") {
      // User or system direct actions
      if (evaluatedRisk === "critical") {
        return PolicyDecisionSchema.parse({
          decision: "require_approval",
          riskLevel: "critical",
          reason: `Critical system operation requires explicit confirmation.`,
          evaluatedAt,
          policyVersion: this.policyVersion,
        });
      }
      return PolicyDecisionSchema.parse({
        decision: "allow",
        riskLevel: evaluatedRisk,
        reason: `Authorized direct user/system operation within project "${ctx.project.id}".`,
        evaluatedAt,
        policyVersion: this.policyVersion,
      });
    }

    // Autonomous Agent / Tool / MCP execution
    if (evaluatedRisk === "critical" || (evaluatedRisk === "high" && this.defaultApprovalOnHighRisk)) {
      return PolicyDecisionSchema.parse({
        decision: "require_approval",
        riskLevel: evaluatedRisk,
        reason: `Operation classified as ${evaluatedRisk.toUpperCase()} risk requires human-in-the-loop approval.`,
        evaluatedAt,
        policyVersion: this.policyVersion,
      });
    }

    return PolicyDecisionSchema.parse({
      decision: "allow",
      riskLevel: evaluatedRisk,
      reason: `Authorized ${evaluatedRisk.toUpperCase()} risk operation for actor "${ctx.actor.id}".`,
      evaluatedAt,
      policyVersion: this.policyVersion,
    });
  }

  private matchesRule(rule: PolicyRule, ctx: PolicyEvaluationContext): boolean {
    const scope = rule.scope;
    if (scope.projectId && scope.projectId !== ctx.project.id) return false;
    if (scope.actorType && scope.actorType !== ctx.actor.type) return false;
    if (scope.toolName && scope.toolName !== ctx.operation.toolName) return false;
    if (scope.sensitivity && scope.sensitivity !== ctx.dataSensitivity) return false;
    if (scope.operationType && scope.operationType !== ctx.operation.type) return false;
    return true;
  }
}
