import { z } from "zod";
import { SensitivityLevelSchema } from "./security.js";

/**
 * Origin source for attachments.
 * PRD Part 1 Section 14.
 */
export const AttachmentSourceSchema = z.enum([
  "user-upload",
  "filesystem",
  "clipboard",
  "browser",
  "tool",
  "mcp",
  "generated",
]);
export type AttachmentSource = z.infer<typeof AttachmentSourceSchema>;

/**
 * Attachment registry entry contract.
 * PRD Part 1 Section 14.
 */
export const AttachmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().length(64),
  source: AttachmentSourceSchema,
  projectId: z.string().optional(),
  sessionId: z.string().optional(),
  taskId: z.string().optional(),
  sensitivity: SensitivityLevelSchema,
  createdAt: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});
export type Attachment = z.infer<typeof AttachmentSchema>;
