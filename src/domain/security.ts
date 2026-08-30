import { z } from "zod";

/**
 * Trust level assigned to sources, content, and environments.
 * PRD Part 1 Section 34 / Part 3 Security Model.
 */
export const TrustLevelSchema = z.enum([
  "trusted",
  "user-content",
  "repository-content",
  "web-content",
  "mcp-content",
  "untrusted",
]);
export type TrustLevel = z.infer<typeof TrustLevelSchema>;

/**
 * Sensitivity classification for data, attachments, and memory.
 * PRD Part 1 Section 14 / Tech Stack Section 8.
 */
export const SensitivityLevelSchema = z.enum([
  "public",
  "normal",
  "sensitive",
  "secret",
]);
export type SensitivityLevel = z.infer<typeof SensitivityLevelSchema>;

/**
 * Authority class defining the security precedence of context and instructions.
 * PRD Part 1 Section 119.
 */
export const AuthorityClassSchema = z.enum([
  "system",
  "security-policy",
  "developer",
  "user",
  "project-instruction",
  "skill",
  "agent",
  "tool-output",
  "mcp-output",
  "repository-content",
  "web-content",
  "attachment",
]);
export type AuthorityClass = z.infer<typeof AuthorityClassSchema>;

/**
 * Security metadata attached to all universal content, artifacts, and context items.
 * PRD Part 1 Section 118.
 */
export const SecurityMetadataSchema = z.object({
  trust: TrustLevelSchema,
  sensitivity: SensitivityLevelSchema,
  scanned: z.boolean(),
  scanVersion: z.string().optional(),
  authority: AuthorityClassSchema.optional(),
  sandboxBoundary: z.enum(["local", "docker", "isolated-vm"]).optional(),
});
export type SecurityMetadata = z.infer<typeof SecurityMetadataSchema>;
