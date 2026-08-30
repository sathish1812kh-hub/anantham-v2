import { z } from "zod";
import { ContextPlanSchema } from "../domain/context.js";

export const CompactionArtifactRefSchema = z.object({
  artifactId: z.string().min(1),
  uri: z.string().optional(),
  description: z.string().optional(),
});
export type CompactionArtifactRef = z.infer<typeof CompactionArtifactRefSchema>;

export const CompactionSummarySchema = z.object({
  objective: z.string().min(1),
  facts: z.array(z.string()),
  decisions: z.array(z.string()),
  constraints: z.array(z.string()),
  currentState: z.string().min(1),
  unresolved: z.array(z.string()),
  artifactReferences: z.array(CompactionArtifactRefSchema),
  provenance: z.object({
    sourceEventIds: z.array(z.string()),
    compactedAt: z.string().min(1),
  }),
  pendingActions: z.array(z.string()),
});
export type CompactionSummary = z.infer<typeof CompactionSummarySchema>;

export const CompactionPreviewSchema = z.object({
  currentTokens: z.number().int().nonnegative(),
  projectedTokens: z.number().int().nonnegative(),
  estimatedSavings: z.number().int(),
  preservedItemCount: z.number().int().nonnegative(),
  summarizedItemCount: z.number().int().nonnegative(),
  omittedItemCount: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
});
export type CompactionPreview = z.infer<typeof CompactionPreviewSchema>;

export const CompactionResultSchema = z.object({
  compactionId: z.string().min(1),
  sessionId: z.string().min(1),
  compactedPlan: ContextPlanSchema,
  summary: CompactionSummarySchema,
  tokensBefore: z.number().int().nonnegative(),
  tokensAfter: z.number().int().nonnegative(),
  eventId: z.string().min(1),
});
export type CompactionResult = z.infer<typeof CompactionResultSchema>;
