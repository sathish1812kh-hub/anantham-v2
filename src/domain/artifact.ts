import { z } from "zod";

/**
 * Artifact type categorization.
 * PRD Part 1 Section 96 & 97.
 */
export const ArtifactTypeSchema = z.enum([
  "plan",
  "task-list",
  "diff",
  "patch",
  "screenshot",
  "image",
  "pdf",
  "research-report",
  "test-report",
  "build-report",
  "review-report",
  "security-report",
  "browser-trace",
  "recording",
  "log",
  "generated-file",
  "diagram",
  "verification-result",
  "custom",
]);
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;

/**
 * Artifact verification details.
 */
export const ArtifactVerificationSchema = z.object({
  status: z.enum(["unverified", "verified", "failed"]),
  checks: z.array(z.string()),
  verifiedAt: z.string().optional(),
  verifierId: z.string().optional(),
});
export type ArtifactVerification = z.infer<typeof ArtifactVerificationSchema>;

/**
 * Durable Artifact contract.
 * PRD Part 1 Section 97.
 */
export const ArtifactSchema = z.object({
  id: z.string().min(1),
  type: ArtifactTypeSchema.or(z.string()),
  projectId: z.string().optional(),
  sessionId: z.string().optional(),
  taskId: z.string().optional(),
  agentId: z.string().optional(),
  contentUri: z.string().min(1),
  previewUri: z.string().optional(),
  sha256: z.string().length(64),
  sourceEventIds: z.array(z.string()),
  verification: ArtifactVerificationSchema.optional(),
  createdAt: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});
export type Artifact = z.infer<typeof ArtifactSchema>;
