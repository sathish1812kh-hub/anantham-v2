import { z } from "zod";
import { SensitivityLevelSchema } from "./security.js";
import {
  CapabilityRequirementSchema,
  ModelCapabilityProfileSchema,
} from "./capability.js";
import { ModelResponseSchema } from "./model.js";

/**
 * Model candidate representation in the routing pool.
 * PRD Part 1 Section 83 & PRD Part 2 Section 42.
 */
export const ModelCandidateSchema = z.object({
  modelId: z.string().min(1),
  providerId: z.string().min(1),
  profile: ModelCapabilityProfileSchema,
  priority: z.number().int().default(0),
  maxSensitivity: SensitivityLevelSchema.default("secret"),
});
export type ModelCandidate = z.infer<typeof ModelCandidateSchema>;

/**
 * Request payload for ModelRouter candidate evaluation and selection.
 */
export const RoutingRequestSchema = z.object({
  requirements: CapabilityRequirementSchema,
  preferredModelId: z.string().optional(),
  preferredProviderId: z.string().optional(),
  taskType: z.string().optional(),
  maxAttempts: z.number().int().positive().default(3),
  sensitivity: SensitivityLevelSchema.default("normal"),
});
export type RoutingRequest = z.infer<typeof RoutingRequestSchema>;

/**
 * Audit record of an individual provider execution attempt.
 */
export const ExecutionAttemptRecordSchema = z.object({
  attemptNumber: z.number().int().positive(),
  modelId: z.string().min(1),
  providerId: z.string().min(1),
  status: z.enum(["success", "failure"]),
  errorName: z.string().optional(),
  errorMessage: z.string().optional(),
  durationMs: z.number().int().nonnegative(),
  timestamp: z.string().min(1),
});
export type ExecutionAttemptRecord = z.infer<typeof ExecutionAttemptRecordSchema>;

/**
 * Rejected candidate with operational reason.
 */
export const RejectedCandidateSchema = z.object({
  modelId: z.string(),
  providerId: z.string(),
  reason: z.string(),
});
export type RejectedCandidate = z.infer<typeof RejectedCandidateSchema>;

/**
 * Deterministic routing evaluation decision.
 */
export const RoutingDecisionSchema = z.object({
  selectedCandidate: ModelCandidateSchema,
  rankedCandidates: z.array(ModelCandidateSchema),
  rejectedCandidates: z.array(RejectedCandidateSchema),
  explanation: z.string(),
});
export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;

/**
 * Complete result of routed model execution with fallback audit.
 */
export const RoutingExecutionResultSchema = z.object({
  response: ModelResponseSchema,
  decision: RoutingDecisionSchema,
  attempts: z.array(ExecutionAttemptRecordSchema),
  succeededCandidate: ModelCandidateSchema,
});
export type RoutingExecutionResult = z.infer<typeof RoutingExecutionResultSchema>;
