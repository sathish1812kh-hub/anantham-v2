import { z } from "zod";

/**
 * Project lifecycle status.
 */
export const ProjectStatusSchema = z.enum(["active", "archived", "paused"]);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

/**
 * Project trust profile affecting baseline permissions.
 * PRD Part 1 Section 34.
 */
export const TrustProfileSchema = z.enum([
  "untrusted",
  "safe",
  "developer",
  "trusted",
  "custom",
]);
export type TrustProfile = z.infer<typeof TrustProfileSchema>;

/**
 * Durable Project registry contract.
 * PRD Part 1 Section 28 (PRD-PROJ-001).
 */
export const ProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  rootPath: z.string().min(1),
  status: ProjectStatusSchema,
  tags: z.array(z.string()),
  modelProfile: z.string().min(1),
  memoryNamespace: z.string().min(1),
  orchestrationProfile: z.string().min(1),
  trustProfile: TrustProfileSchema,
  createdAt: z.string().min(1),
  lastOpenedAt: z.string().min(1),
  lastActivityAt: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});
export type Project = z.infer<typeof ProjectSchema>;
