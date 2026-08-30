import { z } from "zod";

/**
 * Session status enum.
 */
export const SessionStatusSchema = z.enum(["active", "paused", "completed", "archived"]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

/**
 * Durable Session model.
 * PRD Part 1 Section 35 & 36.
 */
export const SessionSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().min(1),
  branch: z.string().min(1),
  currentTaskId: z.string().optional(),
  parentSessionId: z.string().optional(),
  status: SessionStatusSchema,
  modelProfile: z.string().min(1),
  keyPoolProfile: z.string().min(1),
  mode: z.enum(["interactive", "autonomous", "supervised", "headless"]),
  permissions: z.record(z.boolean().or(z.string())),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});
export type Session = z.infer<typeof SessionSchema>;
