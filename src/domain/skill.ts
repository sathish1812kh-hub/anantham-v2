/**
 * Anantham V2 — Skill Domain Contracts
 *
 * Defines authoritative domain models, types, and runtime Zod schemas for
 * Skill manifests, frontmatter, procedures, metadata indices, test fixtures,
 * execution provenance records, and lifecycle states.
 */

import { z } from "zod";

export const SkillLifecycleStateSchema = z.enum([
  "discovered",
  "validated",
  "installed",
  "enabled",
  "disabled",
  "loading",
  "loaded",
  "failed",
]);
export type SkillLifecycleState = z.infer<typeof SkillLifecycleStateSchema>;

export const SkillTrustStateSchema = z.enum([
  "unknown",
  "reviewed",
  "trusted",
  "blocked",
]);
export type SkillTrustState = z.infer<typeof SkillTrustStateSchema>;

export const SkillFrontmatterSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  version: z
    .string()
    .min(1)
    .regex(/^\d+\.\d+\.\d+(-[a-zA-Z0-9\.]+)?$/, "Version must follow semantic versioning (SemVer)"),
  tools: z.array(z.string()).optional().default([]),
  mcp: z.array(z.string()).optional().default([]),
  skills: z.array(z.string()).optional().default([]),
  capabilities: z.array(z.string()).optional().default([]),
  runtime: z.string().optional().default("anantham>=2.0"),
  tags: z.array(z.string()).optional().default([]),
  publisher: z.string().optional().default("local"),
});
export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;

export const SkillMetadataSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z0-9_\-\.]+$/, "Skill ID must be alphanumeric with dashes, dots, or underscores"),
  name: z.string().min(1),
  description: z.string().min(1),
  version: z.string().min(1),
  tools: z.array(z.string()).default([]),
  mcp: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  capabilities: z.array(z.string()).default([]),
  runtime: z.string().default("anantham>=2.0"),
  tags: z.array(z.string()).default([]),
  publisher: z.string().default("local"),
});
export type SkillMetadata = z.infer<typeof SkillMetadataSchema>;

export const SkillProcedureSchema = z.object({
  preconditions: z.array(z.string()).default([]),
  steps: z.array(z.string()).default([]),
  successCriteria: z.array(z.string()).default([]),
  rawMarkdown: z.string().default(""),
});
export type SkillProcedure = z.infer<typeof SkillProcedureSchema>;

export const SkillManifestSchema = z.object({
  metadata: SkillMetadataSchema,
  procedure: SkillProcedureSchema,
});
export type SkillManifest = z.infer<typeof SkillManifestSchema>;

export const SkillRecordSchema = z.object({
  id: z.string().min(1),
  manifest: SkillManifestSchema,
  trustState: SkillTrustStateSchema.default("unknown"),
  lifecycleState: SkillLifecycleStateSchema.default("discovered"),
  installPath: z.string().optional(),
  projectPin: z.string().optional(),
  installedAt: z.string().datetime().optional(),
  lastLoadedAt: z.string().datetime().optional(),
});
export type SkillRecord = z.infer<typeof SkillRecordSchema>;

export const SkillTestFixtureSchema = z.object({
  id: z.string().min(1),
  skillId: z.string().min(1),
  inputProject: z.string().default(""),
  expectedCommands: z.array(z.string()).default([]),
  expectedArtifacts: z.array(z.string()).default([]),
  expectedVerification: z.array(z.string()).default([]),
});
export type SkillTestFixture = z.infer<typeof SkillTestFixtureSchema>;

export const SkillTestResultSchema = z.object({
  skillId: z.string().min(1),
  passed: z.boolean(),
  durationMs: z.number().nonnegative(),
  assertions: z.array(
    z.object({
      assertion: z.string(),
      passed: z.boolean(),
      error: z.string().optional(),
    })
  ),
  artifactsProduced: z.array(z.string()).default([]),
});
export type SkillTestResult = z.infer<typeof SkillTestResultSchema>;

export const SkillExecutionRecordSchema = z.object({
  id: z.string().min(1),
  skillId: z.string().min(1),
  version: z.string().min(1),
  projectId: z.string().min(1),
  sessionId: z.string().optional(),
  taskId: z.string().optional(),
  contextRevision: z.number().int().nonnegative().optional(),
  toolsUsed: z.array(z.string()).default([]),
  mcpUsed: z.array(z.string()).default([]),
  result: z.string().default("success"),
  timestamp: z.string().datetime(),
});
export type SkillExecutionRecord = z.infer<typeof SkillExecutionRecordSchema>;

export const SkillPinMapSchema = z.record(z.string(), z.string());
export type SkillPinMap = z.infer<typeof SkillPinMapSchema>;
