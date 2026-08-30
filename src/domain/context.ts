import { z } from "zod";
import { AuthorityClassSchema } from "./security.js";

/**
 * Context retention priority.
 * PRD Part 1 Section 77.
 */
export const ContextPrioritySchema = z.enum([
  "CRITICAL",
  "HIGH",
  "NORMAL",
  "LOW",
  "DROP",
]);
export type ContextPriority = z.infer<typeof ContextPrioritySchema>;

/**
 * Context item representing selected evidence/context assembled for model invocation.
 */
export const ContextItemSchema = z.object({
  id: z.string().min(1),
  sourceType: z.enum([
    "project",
    "task",
    "history",
    "memory",
    "file",
    "attachment",
    "artifact",
    "skill",
    "tool-schema",
    "diagnostic",
    "system",
  ]),
  sourceId: z.string().min(1),
  representationType: z.string().min(1),
  priority: ContextPrioritySchema,
  estimatedTokens: z.number().int().nonnegative(),
  selectedBecause: z.string().min(1),
  authority: AuthorityClassSchema,
  content: z.string().optional(),
  uri: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type ContextItem = z.infer<typeof ContextItemSchema>;

/**
 * Context omission record documenting deliberately dropped or compressed information.
 */
export const ContextOmissionSchema = z.object({
  sourceId: z.string().min(1),
  reason: z.string().min(1),
  estimatedTokens: z.number().int().nonnegative(),
});
export type ContextOmission = z.infer<typeof ContextOmissionSchema>;

/**
 * Context planning decision record.
 */
export const ContextDecisionSchema = z.object({
  decisionType: z.enum(["include", "compress", "omit", "defer-schema", "prune-tool-result"]),
  rationale: z.string().min(1),
  affectedItems: z.array(z.string()),
});
export type ContextDecision = z.infer<typeof ContextDecisionSchema>;

/**
 * Assembled ContextPlan contract.
 * PRD Part 1 Section 76.
 */
export const ContextPlanSchema = z.object({
  id: z.string().min(1),
  items: z.array(ContextItemSchema),
  estimatedTokens: z.number().int().nonnegative(),
  modalityUsage: z.object({
    text: z.number().int().nonnegative().optional(),
    image: z.number().int().nonnegative().optional(),
    audio: z.number().int().nonnegative().optional(),
    video: z.number().int().nonnegative().optional(),
  }),
  omitted: z.array(ContextOmissionSchema),
  decisions: z.array(ContextDecisionSchema),
  checkpointSource: z.string().optional(),
  createdAt: z.string().min(1),
});
export type ContextPlan = z.infer<typeof ContextPlanSchema>;
