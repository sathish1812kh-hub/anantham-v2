import { z } from "zod";

/**
 * Input Modalities supported by a model.
 * PRD Part 1 Section 83 & PRD Part 2 Section 41.
 */
export const ModelInputCapabilitiesSchema = z.object({
  textInput: z.boolean().default(true),
  imageInput: z.boolean().default(false),
  audioInput: z.boolean().default(false),
  videoInput: z.boolean().default(false),
  documentInput: z.boolean().default(false),
});
export type ModelInputCapabilities = z.infer<typeof ModelInputCapabilitiesSchema>;

/**
 * Output Modalities supported by a model.
 */
export const ModelOutputCapabilitiesSchema = z.object({
  textOutput: z.boolean().default(true),
  imageOutput: z.boolean().default(false),
  audioOutput: z.boolean().default(false),
  videoOutput: z.boolean().default(false),
});
export type ModelOutputCapabilities = z.infer<typeof ModelOutputCapabilitiesSchema>;

/**
 * Execution & Architecture Features supported by a model.
 */
export const ModelFeatureCapabilitiesSchema = z.object({
  toolCalling: z.boolean().default(false),
  parallelToolCalls: z.boolean().default(false),
  structuredOutput: z.boolean().default(false),
  jsonSchema: z.boolean().default(false),
  streaming: z.boolean().default(true),
  reasoning: z.boolean().default(false),
  computerUse: z.boolean().default(false),
  webSearch: z.boolean().default(false),
  codeExecution: z.boolean().default(false),
  promptCaching: z.boolean().default(false),
});
export type ModelFeatureCapabilities = z.infer<typeof ModelFeatureCapabilitiesSchema>;

/**
 * Quantitative constraints and token limits for a model.
 */
export const ModelLimitConstraintsSchema = z.object({
  contextWindow: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive(),
});
export type ModelLimitConstraints = z.infer<typeof ModelLimitConstraintsSchema>;

/**
 * Profile status lifecycle.
 */
export const CapabilityProfileStatusSchema = z.enum([
  "valid",
  "stale",
  "unknown",
  "invalid",
]);
export type CapabilityProfileStatus = z.infer<typeof CapabilityProfileStatusSchema>;

/**
 * Complete Model Capability Profile.
 */
export const ModelCapabilityProfileSchema = z.object({
  modelId: z.string().min(1),
  providerId: z.string().optional(),
  inputs: ModelInputCapabilitiesSchema,
  outputs: ModelOutputCapabilitiesSchema,
  features: ModelFeatureCapabilitiesSchema,
  limits: ModelLimitConstraintsSchema,
  status: CapabilityProfileStatusSchema.default("valid"),
  lastVerifiedAt: z.string().optional(),
});
export type ModelCapabilityProfile = z.infer<typeof ModelCapabilityProfileSchema>;

/**
 * Requested operational requirements to check against capability profiles.
 */
export const CapabilityRequirementSchema = z.object({
  requiredInputs: z
    .array(z.enum(["text", "image", "audio", "video", "document"]))
    .optional(),
  requiredOutputs: z
    .array(z.enum(["text", "image", "audio", "video"]))
    .optional(),
  requiredFeatures: z
    .array(
      z.enum([
        "toolCalling",
        "parallelToolCalls",
        "structuredOutput",
        "jsonSchema",
        "streaming",
        "reasoning",
        "computerUse",
        "webSearch",
        "codeExecution",
        "promptCaching",
      ])
    )
    .optional(),
  minContextTokens: z.number().int().positive().optional(),
  requiredOutputTokens: z.number().int().positive().optional(),
});
export type CapabilityRequirement = z.infer<typeof CapabilityRequirementSchema>;

/**
 * Resolution result status.
 */
export const ResolutionStatusSchema = z.enum([
  "COMPATIBLE",
  "INCOMPATIBLE",
  "UNKNOWN",
  "LIMIT_EXCEEDED",
]);
export type ResolutionStatus = z.infer<typeof ResolutionStatusSchema>;

/**
 * Limit insufficiency detail.
 */
export const InsufficientLimitSchema = z.object({
  limit: z.string(),
  required: z.number(),
  supported: z.number(),
});
export type InsufficientLimit = z.infer<typeof InsufficientLimitSchema>;

/**
 * Structured resolution evaluation report.
 */
export const CapabilityResolutionResultSchema = z.object({
  compatible: z.boolean(),
  status: ResolutionStatusSchema,
  missingCapabilities: z.array(z.string()),
  insufficientLimits: z.array(InsufficientLimitSchema),
  conflicts: z.array(z.string()),
  explanation: z.string(),
});
export type CapabilityResolutionResult = z.infer<
  typeof CapabilityResolutionResultSchema
>;
