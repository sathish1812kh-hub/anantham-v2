import { z } from "zod";
import { ActorTypeSchema } from "./event.js";
import { SensitivityLevelSchema } from "./security.js";

/**
 * Deterministic risk level classification.
 * PRD Part 1 Section 34 & PRD Part 3 Section 146.
 */
export const RiskLevelSchema = z.enum(["low", "medium", "high", "critical"]);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

/**
 * Core policy decision types.
 */
export const PolicyDecisionTypeSchema = z.enum(["allow", "deny", "require_approval"]);
export type PolicyDecisionType = z.infer<typeof PolicyDecisionTypeSchema>;

/**
 * Declarative policy rule contract.
 */
export const PolicyRuleSchema = z.object({
  ruleId: z.string().min(1),
  name: z.string().min(1),
  priority: z.number().default(0),
  scope: z
    .object({
      projectId: z.string().optional(),
      actorType: ActorTypeSchema.optional(),
      toolName: z.string().optional(),
      sensitivity: SensitivityLevelSchema.optional(),
      operationType: z.string().optional(),
    })
    .default({}),
  effect: PolicyDecisionTypeSchema,
  riskLevel: RiskLevelSchema,
  reason: z.string().min(1),
});
export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

/**
 * Context payload provided to the PolicyEngine for deterministic evaluation.
 */
export const PolicyEvaluationContextSchema = z.object({
  actor: z.object({
    id: z.string().min(1),
    type: ActorTypeSchema,
    role: z.string().optional(),
  }),
  project: z.object({
    id: z.string().min(1),
    trustProfile: z.string().optional(),
  }),
  session: z.object({ id: z.string() }).optional(),
  task: z.object({ id: z.string() }).optional(),
  operation: z.object({
    type: z.string().min(1),
    toolName: z.string().optional(),
    resource: z.string().optional(),
    arguments: z.record(z.unknown()).optional(),
    targetProjectId: z.string().optional(),
  }),
  dataSensitivity: SensitivityLevelSchema.optional(),
  requestedRiskLevel: RiskLevelSchema.optional(),
});
export type PolicyEvaluationContext = z.infer<typeof PolicyEvaluationContextSchema>;

/**
 * Authoritative Policy Decision output.
 */
export const PolicyDecisionSchema = z.object({
  decision: PolicyDecisionTypeSchema,
  riskLevel: RiskLevelSchema,
  reason: z.string().min(1),
  ruleId: z.string().optional(),
  approvalId: z.string().optional(),
  argumentsDigest: z.string().optional(),
  evaluatedAt: z.string().min(1),
  policyVersion: z.string().min(1),
});
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;

/**
 * Lifecycle status of a human approval gate.
 */
export const ApprovalStatusSchema = z.enum(["pending", "approved", "rejected", "expired", "cancelled"]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

/**
 * Durable Approval record with TOCTOU cryptographic binding digest.
 */
export const ApprovalRecordSchema = z.object({
  approvalId: z.string().min(1),
  projectId: z.string().min(1),
  sessionId: z.string().optional(),
  taskId: z.string().optional(),
  actorId: z.string().min(1),
  action: z.string().min(1),
  riskLevel: RiskLevelSchema,
  argumentsDigest: z.string().min(1),
  status: ApprovalStatusSchema,
  createdAt: z.string().min(1),
  expiresAt: z.string().optional(),
  decidedAt: z.string().optional(),
  decidedBy: z.string().optional(),
  decisionReason: z.string().optional(),
  policyVersion: z.string().min(1),
});
export type ApprovalRecord = z.infer<typeof ApprovalRecordSchema>;
