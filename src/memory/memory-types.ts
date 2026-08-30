import { z } from "zod";
import { MemoryItemSchema, MemoryScopeSchema } from "../domain/memory.js";
import { SensitivityLevelSchema } from "../domain/security.js";

export const MemorySearchQuerySchema = z.object({
  query: z.string().min(1),
  projectId: z.string().min(1),
  sessionId: z.string().optional(),
  scope: MemoryScopeSchema.optional(),
  type: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(10),
  minConfidence: z.number().min(0).max(1).default(0),
  maxSensitivity: SensitivityLevelSchema.optional(),
});
export type MemorySearchQuery = z.infer<typeof MemorySearchQuerySchema>;

export const MemorySearchResultSchema = z.object({
  item: MemoryItemSchema,
  score: z.number().min(0),
  matchSnippet: z.string().optional(),
  matchReasons: z.array(z.string()).default([]),
});
export type MemorySearchResult = z.infer<typeof MemorySearchResultSchema>;
