import { z } from "zod";
import { SensitivityLevelSchema } from "./security.js";

/**
 * Memory scope classification.
 * PRD Part 1 Section 62 & 63.
 */
export const MemoryScopeSchema = z.enum([
  "working",
  "session",
  "project",
  "agent",
  "global",
  "episodic",
]);
export type MemoryScope = z.infer<typeof MemoryScopeSchema>;

/**
 * Memory item priority.
 */
export const MemoryPrioritySchema = z.enum([
  "CRITICAL",
  "HIGH",
  "NORMAL",
  "LOW",
]);
export type MemoryPriority = z.infer<typeof MemoryPrioritySchema>;

/**
 * Durable MemoryItem contract.
 * PRD Part 1 Section 63.
 */
export const MemoryItemSchema = z.object({
  id: z.string().min(1),
  scope: MemoryScopeSchema,
  projectId: z.string().optional(),
  sessionId: z.string().optional(),
  agentId: z.string().optional(),
  type: z.string().min(1),
  content: z.string().min(1),
  confidence: z.number().min(0).max(1),
  priority: MemoryPrioritySchema,
  sourceEventIds: z.array(z.string()),
  sourceArtifacts: z.array(z.string()).optional(),
  createdAt: z.string().min(1),
  lastValidatedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  sensitivity: SensitivityLevelSchema,
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type MemoryItem = z.infer<typeof MemoryItemSchema>;
