import { z } from "zod";

/**
 * Agent lifecycle status schema.
 * PRD Part 2 Section 279.
 */
export const AgentStatusSchema = z.enum([
  "configured",
  "resolving",
  "ready",
  "running",
  "paused",
  "completed",
  "failed",
  "blocked",
  "stopped",
]);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

/**
 * Resource and execution budget for an agent.
 * PRD Part 2 Section 276.
 */
export const AgentBudgetSchema = z.object({
  maxTokens: z.number().int().positive().optional(),
  maxCostUsd: z.number().positive().optional(),
  maxToolCalls: z.number().int().positive().optional(),
  maxDurationSeconds: z.number().int().positive().optional(),
});
export type AgentBudget = z.infer<typeof AgentBudgetSchema>;

/**
 * Context scoping rules for model visibility.
 * PRD Part 1 Section 35.
 */
export const AgentContextScopeSchema = z.object({
  maxTokens: z.number().int().positive().optional(),
  allowedPaths: z.array(z.string()).optional(),
  includeMemory: z.boolean().default(true),
  allowedRepresentations: z.array(z.string()).optional(),
});
export type AgentContextScope = z.infer<typeof AgentContextScopeSchema>;

/**
 * Epistemic memory namespace and access rules.
 * PRD Part 2 Section 281.
 */
export const AgentMemoryScopeSchema = z.object({
  namespace: z.string().min(1),
  readonly: z.boolean().default(false),
  crossProjectAccess: z.boolean().default(false),
});
export type AgentMemoryScope = z.infer<typeof AgentMemoryScopeSchema>;

/**
 * Scope of an agent definition.
 */
export const AgentScopeSchema = z.enum(["global", "project"]);
export type AgentScope = z.infer<typeof AgentScopeSchema>;

/**
 * Declarative Agent manifest schema.
 * PRD Part 2 Section 278.
 */
export const AgentManifestSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-_.]+$/),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+(-[a-zA-Z0-9\.]+)?$/, "Must be valid SemVer"),
  role: z.string().min(1),
  objective: z.string().min(1),
  modelProfile: z.string().min(1).default("default"),
  requiredCapabilities: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  permissionProfile: z.string().min(1).default("developer"),
  executorProfile: z.string().min(1).default("local"),
  budget: AgentBudgetSchema.default({}),
  contextScope: AgentContextScopeSchema.default({ includeMemory: true }),
  memoryScope: AgentMemoryScopeSchema.optional(),
  scope: AgentScopeSchema.default("project"),
  projectId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type AgentManifest = z.infer<typeof AgentManifestSchema>;

/**
 * Fully resolved, immutable startup plan for an agent.
 * PRD Part 2 Section 278.
 */
export const AgentStartupPlanSchema = z.object({
  planId: z.string().min(1),
  agentId: z.string().min(1),
  version: z.string().min(1),
  role: z.string().min(1),
  objective: z.string().min(1),
  resolvedModel: z.object({
    modelId: z.string().min(1),
    provider: z.string().min(1),
    contextLimit: z.number().int().positive(),
  }),
  resolvedCapabilities: z.array(z.string()),
  resolvedTools: z.array(z.string()),
  resolvedSkills: z.array(z.string()),
  grantedPermissions: z.array(z.string()),
  executor: z.object({
    type: z.string().min(1),
    isSandboxed: z.boolean(),
  }),
  contextScope: AgentContextScopeSchema,
  memoryScope: AgentMemoryScopeSchema,
  budget: AgentBudgetSchema,
  projectId: z.string().min(1),
  sessionId: z.string().min(1),
  taskId: z.string().optional(),
  resolvedAt: z.string().datetime(),
});
export type AgentStartupPlan = z.infer<typeof AgentStartupPlanSchema>;

/**
 * Persistent Agent Record stored in registry.
 */
export const AgentRecordSchema = z.object({
  id: z.string().min(1),
  manifest: AgentManifestSchema,
  status: AgentStatusSchema,
  source: z.enum(["builtin", "project", "user", "plugin"]),
  registeredAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AgentRecord = z.infer<typeof AgentRecordSchema>;

/**
 * Runtime execution state of an active agent instance.
 */
export const AgentRuntimeStateSchema = z.object({
  instanceId: z.string().min(1),
  agentId: z.string().min(1),
  startupPlan: AgentStartupPlanSchema,
  status: AgentStatusSchema,
  tokensConsumed: z.number().int().nonnegative().default(0),
  costUsdConsumed: z.number().nonnegative().default(0),
  toolCallsExecuted: z.number().int().nonnegative().default(0),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  errorMessage: z.string().optional(),
});
export type AgentRuntimeState = z.infer<typeof AgentRuntimeStateSchema>;
