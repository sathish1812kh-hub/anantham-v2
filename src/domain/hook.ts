/**
 * Anantham V2 — Hook Domain Contracts
 *
 * Defines authoritative domain models, types, and runtime Zod schemas for
 * Hook manifests, lifecycle triggers, action definitions, error policies,
 * records, and execution outcomes.
 */

import { z } from "zod";

export const HookTriggerTypeSchema = z.enum([
  "SessionStart",
  "SessionResume",
  "SessionEnd",
  "PromptSubmit",
  "BeforeModel",
  "AfterModel",
  "ModelError",
  "BeforeTool",
  "AfterTool",
  "ToolError",
  "BeforeEdit",
  "AfterEdit",
  "BeforeCommand",
  "AfterCommand",
  "BeforeMCP",
  "AfterMCP",
  "BeforeAgent",
  "AfterAgent",
  "BeforeSubagent",
  "AfterSubagent",
  "BeforeCompaction",
  "AfterCompaction",
  "BeforeVerification",
  "AfterVerification",
  "BeforeCommit",
  "BeforePush",
  "BeforeDeploy",
]);
export type HookTriggerType = z.infer<typeof HookTriggerTypeSchema>;

export const HookActionTypeSchema = z.enum([
  "allow",
  "deny",
  "modify",
  "add_context",
  "create_artifact",
  "command",
  "notify",
  "tool",
]);
export type HookActionType = z.infer<typeof HookActionTypeSchema>;

export const HookErrorPolicySchema = z.enum([
  "fail-open",
  "fail-closed",
  "warn",
]);
export type HookErrorPolicy = z.infer<typeof HookErrorPolicySchema>;

export const HookScopeSchema = z.enum(["global", "project"]);
export type HookScope = z.infer<typeof HookScopeSchema>;

export const HookLifecycleStateSchema = z.enum([
  "registered",
  "enabled",
  "disabled",
]);
export type HookLifecycleState = z.infer<typeof HookLifecycleStateSchema>;

export const HookActionSchema = z.object({
  type: HookActionTypeSchema,
  command: z.string().optional(),
  tool: z.string().optional(),
  parameters: z.record(z.string(), z.unknown()).optional().default({}),
  message: z.string().optional(),
  context: z.string().optional(),
  artifact: z
    .object({
      title: z.string(),
      content: z.string(),
    })
    .optional(),
});
export type HookAction = z.infer<typeof HookActionSchema>;

export const HookPolicySchema = z.object({
  onFailure: HookErrorPolicySchema.default("warn"),
  timeoutMs: z.number().int().positive().default(5000),
  maxRetries: z.number().int().nonnegative().default(0),
});
export type HookPolicy = z.infer<typeof HookPolicySchema>;

export const HookFilterSchema = z.object({
  toolName: z.string().optional(),
  pathPattern: z.string().optional(),
  modelProvider: z.string().optional(),
  matchPayload: z.record(z.string(), z.unknown()).optional(),
});
export type HookFilter = z.infer<typeof HookFilterSchema>;

export const HookManifestSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z0-9_\-\.]+$/, "Hook ID must be alphanumeric with dashes, dots, or underscores"),
  name: z.string().min(1),
  version: z
    .string()
    .min(1)
    .regex(/^\d+\.\d+\.\d+(-[a-zA-Z0-9\.]+)?$/, "Version must follow SemVer"),
  description: z.string().optional(),
  event: HookTriggerTypeSchema,
  action: HookActionSchema,
  policy: HookPolicySchema.default({ onFailure: "warn", timeoutMs: 5000, maxRetries: 0 }),
  filter: HookFilterSchema.optional(),
  priority: z.number().int().default(100),
  enabled: z.boolean().default(true),
  scope: HookScopeSchema.default("global"),
  projectId: z.string().optional(),
});
export type HookManifest = z.infer<typeof HookManifestSchema>;

export const HookRecordSchema = z.object({
  id: z.string().min(1),
  manifest: HookManifestSchema,
  lifecycleState: HookLifecycleStateSchema.default("registered"),
  source: z.enum(["system", "project", "plugin"]).default("project"),
  registeredAt: z.string().datetime(),
});
export type HookRecord = z.infer<typeof HookRecordSchema>;

export const HookExecutionResultSchema = z.object({
  hookId: z.string().min(1),
  event: HookTriggerTypeSchema,
  actionType: HookActionTypeSchema,
  success: z.boolean(),
  decision: z.enum(["allow", "deny", "modify", "executed", "skipped"]),
  durationMs: z.number().nonnegative(),
  output: z.unknown().optional(),
  error: z.string().optional(),
  isFailClosedBlocked: z.boolean().default(false),
  timestamp: z.string().datetime(),
});
export type HookExecutionResult = z.infer<typeof HookExecutionResultSchema>;
