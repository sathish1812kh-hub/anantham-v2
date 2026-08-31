import { z } from "zod";

/**
 * Authoritative Workflow Scopes.
 * PRD Part 2 Section 111.
 * Precedence: project > profile > global > built-in.
 */
export const WorkflowScopeSchema = z.enum([
  "built-in",
  "global",
  "profile",
  "project",
]);
export type WorkflowScope = z.infer<typeof WorkflowScopeSchema>;

/**
 * Workflow status lifecycle.
 */
export const WorkflowStatusSchema = z.enum([
  "DRAFT",
  "REGISTERED",
  "ACTIVE",
  "DEPRECATED",
  "DISABLED",
]);
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;

/**
 * Workflow run execution state.
 * PRD Part 2 Section 113.
 */
export const WorkflowRunStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "PAUSED",
  "WAITING_APPROVAL",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);
export type WorkflowRunStatus = z.infer<typeof WorkflowRunStatusSchema>;

/**
 * Workflow Condition evaluation schema.
 */
export const WorkflowConditionSchema = z.object({
  type: z.enum(["expression", "artifact_exists", "task_status", "custom"]),
  expression: z.string().optional(),
  artifactId: z.string().optional(),
  taskId: z.string().optional(),
  expectedStatus: z.string().optional(),
  ifTrue: z.array(z.string()).optional(),
  ifFalse: z.array(z.string()).optional(),
});
export type WorkflowCondition = z.infer<typeof WorkflowConditionSchema>;

/**
 * Single Task Node in a Workflow DAG.
 * PRD Part 2 Section 109 & 110.
 */
export const WorkflowTaskNodeSchema = z.object({
  kind: z.literal("task").default("task"),
  id: z.string().min(1),
  agentId: z.string().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  modelProfile: z.string().optional(),
  dependsOn: z.array(z.string()).default([]),
  condition: WorkflowConditionSchema.optional(),
  timeoutMs: z.number().int().positive().optional(),
  maxRetries: z.number().int().min(0).default(3),
  budgetTokens: z.number().int().positive().optional(),
  inputs: z.record(z.unknown()).default({}),
  outputs: z.array(z.string()).default([]),
  requiredCapabilities: z.array(z.string()).default([]),
  targetFiles: z.array(z.string()).default([]),
  readOnlyFiles: z.array(z.string()).default([]),
});
export type WorkflowTaskNode = z.infer<typeof WorkflowTaskNodeSchema>;

/**
 * Parallel Node grouping multiple parallel tasks.
 * PRD Part 2 Section 110.
 */
export const WorkflowParallelNodeSchema = z.object({
  kind: z.literal("parallel").default("parallel"),
  id: z.string().min(1),
  tasks: z.array(WorkflowTaskNodeSchema).min(1),
  maxConcurrency: z.number().int().positive().optional(),
  dependsOn: z.array(z.string()).default([]),
});
export type WorkflowParallelNode = z.infer<typeof WorkflowParallelNodeSchema>;

/**
 * Foreach Node for iterating across collections.
 * PRD Part 2 Section 110.
 */
export const WorkflowForeachNodeSchema = z.object({
  kind: z.literal("foreach").default("foreach"),
  id: z.string().min(1),
  collection: z.string().min(1),
  iteratorVariable: z.string().min(1),
  task: WorkflowTaskNodeSchema,
  maxConcurrency: z.number().int().positive().optional(),
  dependsOn: z.array(z.string()).default([]),
});
export type WorkflowForeachNode = z.infer<typeof WorkflowForeachNodeSchema>;

/**
 * Automated Verification Node.
 * PRD Part 2 Section 109 & 110.
 */
export const WorkflowVerifyNodeSchema = z.object({
  kind: z.literal("verify").default("verify"),
  id: z.string().min(1),
  assertions: z.array(z.string()).min(1),
  dependsOn: z.array(z.string()).default([]),
});
export type WorkflowVerifyNode = z.infer<typeof WorkflowVerifyNodeSchema>;

/**
 * Human Approval Gate Node.
 * PRD Part 2 Section 110.
 */
export const WorkflowApproveNodeSchema = z.object({
  kind: z.literal("approve").default("approve"),
  id: z.string().min(1),
  message: z.string().min(1),
  requiredRole: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
  dependsOn: z.array(z.string()).default([]),
});
export type WorkflowApproveNode = z.infer<typeof WorkflowApproveNodeSchema>;

/**
 * Union of all valid Workflow Nodes.
 */
export const WorkflowNodeSchema = z.discriminatedUnion("kind", [
  WorkflowTaskNodeSchema,
  WorkflowParallelNodeSchema,
  WorkflowForeachNodeSchema,
  WorkflowVerifyNodeSchema,
  WorkflowApproveNodeSchema,
]);
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;

/**
 * Workflow Concurrency settings.
 * PRD Part 2 Section 109.
 */
export const WorkflowConcurrencySchema = z.object({
  maxAgents: z.number().int().positive().default(4),
  maxParallelTasks: z.number().int().positive().default(8),
});
export type WorkflowConcurrency = z.infer<typeof WorkflowConcurrencySchema>;

/**
 * Workflow Resource & Budget constraints.
 * PRD Part 2 Section 118 & 161.
 */
export const WorkflowBudgetSchema = z.object({
  maxTokens: z.number().int().positive().optional(),
  maxCostUsd: z.number().positive().optional(),
  maxDurationMs: z.number().int().positive().optional(),
});
export type WorkflowBudget = z.infer<typeof WorkflowBudgetSchema>;

/**
 * Complete Workflow Definition contract.
 * PRD Part 2 Section 109 & 112.
 */
export const WorkflowDefinitionSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().optional(),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+/),
  scope: WorkflowScopeSchema.default("project"),
  description: z.string().optional(),
  status: WorkflowStatusSchema.default("ACTIVE"),
  concurrency: WorkflowConcurrencySchema.default({ maxAgents: 4, maxParallelTasks: 8 }),
  budget: WorkflowBudgetSchema.optional(),
  tasks: z.array(WorkflowNodeSchema).min(1),
  verify: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

/**
 * Computed Workflow DAG representation with topological waves.
 * PRD Part 2 Section 116.
 */
export const WorkflowDAGSchema = z.object({
  workflowId: z.string(),
  nodeIds: z.array(z.string()),
  adjacencyList: z.record(z.array(z.string())),
  reverseAdjacency: z.record(z.array(z.string())),
  inDegree: z.record(z.number().int().min(0)),
  levels: z.array(z.array(z.string())),
  hasCycles: z.boolean(),
  cycleNodes: z.array(z.string()).optional(),
});
export type WorkflowDAG = z.infer<typeof WorkflowDAGSchema>;

/**
 * Pinned Versions snapshot for active workflow run.
 * PRD Part 2 Section 112: "A workflow run must pin workflow version, plugin versions, skill versions, agent versions, model profile."
 */
export const PinnedVersionsSchema = z.object({
  workflowVersion: z.string(),
  pluginVersions: z.record(z.string()).default({}),
  skillVersions: z.record(z.string()).default({}),
  agentVersions: z.record(z.string()).default({}),
  modelProfile: z.string().optional(),
});
export type PinnedVersions = z.infer<typeof PinnedVersionsSchema>;

/**
 * Workflow Run instance state.
 * PRD Part 2 Section 113.
 */
export const WorkflowRunSchema = z.object({
  id: z.string().min(1),
  workflowId: z.string().min(1),
  projectId: z.string().optional(),
  sessionId: z.string().min(1),
  status: WorkflowRunStatusSchema.default("QUEUED"),
  currentStepIndex: z.number().int().min(0).default(0),
  completedTasks: z.array(z.string()).default([]),
  failedTasks: z.array(z.string()).default([]),
  runningTasks: z.array(z.string()).default([]),
  taskResults: z.record(z.unknown()).default({}),
  pinnedVersions: PinnedVersionsSchema,
  startedAt: z.string().min(1),
  completedAt: z.string().optional(),
  errorMessage: z.string().optional(),
});
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;
