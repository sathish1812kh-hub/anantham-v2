import { z } from "zod";
import { WorkflowBudgetSchema, WorkflowBudgetConsumptionSchema } from "./workflow.js";

/**
 * Remote Node lifecycle status.
 * PRD Part 2 Section 140–165.
 */
export const NodeStatusSchema = z.enum([
  "REGISTERED",
  "ONLINE",
  "BUSY",
  "DRAINING",
  "OFFLINE",
  "QUARANTINED",
]);
export type NodeStatus = z.infer<typeof NodeStatusSchema>;

/**
 * Authoritative Node Identity contract.
 * PRD Part 2 Section 141.
 */
export const NodeIdentitySchema = z.object({
  id: z.string().min(1), // nodeId e.g. "node_worker_01"
  nodeVersion: z.string().min(1),
  runtimeVersion: z.string().min(1),
  capabilities: z.array(z.string()).default([]),
  executorProfiles: z.array(z.string()).default(["local"]),
  supportedModels: z.array(z.string()).default([]),
  supportedTools: z.array(z.string()).default([]),
  projectScope: z.array(z.string()).default(["*"]), // Allowed project IDs or wildcard "*"
  status: NodeStatusSchema.default("REGISTERED"),
  endpointUrl: z.string().min(1),
  registeredAt: z.string().min(1), // ISO timestamp
  lastHeartbeatAt: z.string().min(1), // ISO timestamp
  authTokenHash: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type NodeIdentity = z.infer<typeof NodeIdentitySchema>;

/**
 * Remote Node Registration Request.
 */
export const NodeRegistrationRequestSchema = z.object({
  id: z.string().min(1),
  nodeVersion: z.string().min(1),
  runtimeVersion: z.string().min(1),
  capabilities: z.array(z.string()).optional(),
  executorProfiles: z.array(z.string()).optional(),
  supportedModels: z.array(z.string()).optional(),
  supportedTools: z.array(z.string()).optional(),
  projectScope: z.array(z.string()).optional(),
  endpointUrl: z.string().min(1),
  authToken: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type NodeRegistrationRequest = z.infer<typeof NodeRegistrationRequestSchema>;

/**
 * Remote Node Heartbeat Request.
 */
export const NodeHeartbeatRequestSchema = z.object({
  nodeId: z.string().min(1),
  status: NodeStatusSchema.optional(),
  activeDispatches: z.number().int().nonnegative().optional(),
  authToken: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type NodeHeartbeatRequest = z.infer<typeof NodeHeartbeatRequestSchema>;

/**
 * Remote Dispatch Status.
 */
export const RemoteDispatchStatusSchema = z.enum([
  "DISPATCHED",
  "ACCEPTED",
  "REJECTED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "TIMED_OUT",
  "CANCELLED",
  "RECLAIMED",
]);
export type RemoteDispatchStatus = z.infer<typeof RemoteDispatchStatusSchema>;

/**
 * Authoritative Remote Work Request (Dispatch Contract).
 * PRD Part 2 Section 144.
 */
export const RemoteWorkRequestSchema = z.object({
  dispatchId: z.string().min(1),
  jobId: z.string().min(1),
  taskId: z.string().min(1),
  workflowId: z.string().optional(),
  runId: z.string().optional(),
  agentId: z.string().min(1),
  instanceId: z.string().min(1),
  nodeId: z.string().min(1),
  projectId: z.string().min(1),
  sessionId: z.string().min(1),
  planId: z.string().optional(),
  generation: z.number().int().positive(), // Authoritative fencing token
  leaseId: z.string().min(1),
  requiredCapabilities: z.array(z.string()).default([]),
  budget: WorkflowBudgetSchema.optional(),
  deadline: z.string().optional(), // ISO timestamp
  payload: z.unknown().optional(),
  idempotencyKey: z.string().min(1),
  createdAt: z.string().min(1),
  status: RemoteDispatchStatusSchema.default("DISPATCHED"),
  metadata: z.record(z.unknown()).default({}),
});
export type RemoteWorkRequest = z.infer<typeof RemoteWorkRequestSchema>;

/**
 * Remote Result Contract returned by remote worker nodes.
 * PRD Part 2 Section 154.
 */
export const RemoteResultSchema = z.object({
  dispatchId: z.string().min(1),
  nodeId: z.string().min(1),
  taskId: z.string().min(1),
  jobId: z.string().min(1),
  generation: z.number().int().positive(), // Worker must echo generation token
  leaseId: z.string().min(1),
  status: z.enum(["SUCCESS", "FAILURE"]),
  artifacts: z.array(z.string()).default([]),
  data: z.unknown().optional(),
  consumption: WorkflowBudgetConsumptionSchema.default({
    tokens: 0,
    costUsd: 0,
    durationMs: 0,
    toolCalls: 0,
  }),
  error: z.string().optional(),
  completedAt: z.string().min(1),
  signature: z.string().optional(),
});
export type RemoteResult = z.infer<typeof RemoteResultSchema>;
