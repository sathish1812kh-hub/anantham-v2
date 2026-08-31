import { z } from "zod";
import { AgentBudgetSchema, AgentContextScopeSchema, AgentMemoryScopeSchema, AgentStartupPlanSchema } from "./agent.js";

/**
 * Explicit team roles.
 * PRD Part 2 Section 42.
 */
export const TeamRoleSchema = z.enum([
  "coordinator",
  "planner",
  "implementer",
  "reviewer",
  "verifier",
  "specialist",
]);
export type TeamRole = z.infer<typeof TeamRoleSchema>;

/**
 * Supported team topologies.
 * PRD Part 2 Section 43.
 */
export const TeamTopologySchema = z.enum([
  "coordinator_workers",
  "pipeline",
  "peer_to_peer",
  "specialist_pool",
]);
export type TeamTopology = z.infer<typeof TeamTopologySchema>;

/**
 * Team lifecycle status.
 */
export const TeamStatusSchema = z.enum([
  "DRAFT",
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
  "ARCHIVED",
]);
export type TeamStatus = z.infer<typeof TeamStatusSchema>;

/**
 * Team member status.
 */
export const TeamMemberStatusSchema = z.enum([
  "ACTIVE",
  "IDLE",
  "BUSY",
  "PAUSED",
  "FAILED",
  "LEFT",
]);
export type TeamMemberStatus = z.infer<typeof TeamMemberStatusSchema>;

/**
 * Explicit durable team member contract.
 */
export const TeamMemberSchema = z.object({
  agentId: z.string().min(1),
  instanceId: z.string().min(1),
  teamId: z.string().min(1),
  role: TeamRoleSchema,
  status: TeamMemberStatusSchema,
  joinedAt: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});
export type TeamMember = z.infer<typeof TeamMemberSchema>;

/**
 * Authoritative Team Definition contract.
 * PRD Part 2 Section 42.
 */
export const TeamDefinitionSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  name: z.string().min(1),
  projectId: z.string().min(1),
  description: z.string().optional(),
  purpose: z.string().min(1),
  roles: z.array(TeamRoleSchema),
  topology: TeamTopologySchema,
  members: z.array(TeamMemberSchema),
  maxMembers: z.number().int().positive().default(16),
  communicationPolicy: z
    .object({
      allowDirectPeerMessages: z.boolean().default(true),
      maxMessageSizeBytes: z.number().int().positive().default(65536),
      requireCoordinatorApprovalForHandoff: z.boolean().default(false),
    })
    .default({}),
  status: TeamStatusSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});
export type TeamDefinition = z.infer<typeof TeamDefinitionSchema>;

/**
 * Peer message type classification.
 * PRD Part 2 Section 46.
 */
export const PeerMessageTypeSchema = z.enum([
  "TASK_HANDOFF",
  "STATUS_UPDATE",
  "REVIEW_REQUEST",
  "REVIEW_RESULT",
  "QUERY",
  "RESPONSE",
  "ALERT",
]);
export type PeerMessageType = z.infer<typeof PeerMessageTypeSchema>;

/**
 * Structured Peer Message contract.
 * PRD Part 2 Section 46.
 */
export const PeerMessageSchema = z.object({
  id: z.string().min(1),
  teamId: z.string().min(1),
  projectId: z.string().min(1),
  senderAgentId: z.string().min(1),
  senderInstanceId: z.string().min(1),
  recipientAgentId: z.string().min(1), // agentId or "broadcast"
  messageType: PeerMessageTypeSchema,
  payload: z.record(z.unknown()),
  artifactRefs: z.array(z.string()).default([]),
  taskRef: z.string().optional(),
  timestamp: z.string().min(1),
  correlationId: z.string().optional(),
  causationId: z.string().optional(),
});
export type PeerMessage = z.infer<typeof PeerMessageSchema>;

/**
 * Handoff status lifecycle.
 * PRD Part 2 Section 49.
 */
export const HandoffStatusSchema = z.enum([
  "PREPARED",
  "TRANSFERRED",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
]);
export type HandoffStatus = z.infer<typeof HandoffStatusSchema>;

/**
 * Authoritative Agent Handoff contract.
 * PRD Part 2 Section 49.
 */
export const AgentHandoffSchema = z.object({
  id: z.string().min(1),
  teamId: z.string().min(1),
  projectId: z.string().min(1),
  sourceAgentId: z.string().min(1),
  sourceInstanceId: z.string().min(1),
  targetAgentId: z.string().min(1),
  targetInstanceId: z.string().optional(),
  taskId: z.string().min(1),
  leaseId: z.string().min(1),
  generation: z.number().int().positive(),
  objective: z.string().min(1),
  acceptanceCriteria: z.array(z.string()).default([]),
  completedWork: z.string().min(1),
  unresolvedIssues: z.array(z.string()).default([]),
  artifactRefs: z.array(z.string()).default([]),
  verificationEvidence: z.record(z.unknown()).optional(),
  status: HandoffStatusSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type AgentHandoff = z.infer<typeof AgentHandoffSchema>;

/**
 * Delegation request contract.
 * PRD Part 2 Section 38.
 */
export const DelegationRequestSchema = z.object({
  parentAgentId: z.string().min(1),
  parentInstanceId: z.string().min(1),
  childAgentId: z.string().min(1),
  childRole: z.string().min(1),
  childObjective: z.string().min(1),
  requestedCapabilities: z.array(z.string()).default([]),
  requestedTools: z.array(z.string()).default([]),
  requestedSkills: z.array(z.string()).default([]),
  requestedPermissions: z.array(z.string()).default([]),
  allocatedBudget: AgentBudgetSchema.partial(),
  contextScope: AgentContextScopeSchema.partial().optional(),
  memoryScope: AgentMemoryScopeSchema.partial().optional(),
  taskId: z.string().optional(),
});
export type DelegationRequest = z.infer<typeof DelegationRequestSchema>;

/**
 * Delegation result payload.
 */
export const DelegationResultSchema = z.object({
  success: z.boolean(),
  childPlan: AgentStartupPlanSchema.optional(),
  childInstanceId: z.string().optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
});
export type DelegationResult = z.infer<typeof DelegationResultSchema>;

/**
 * Team failure propagation policy.
 * PRD Part 2 Section 50.
 */
export const TeamFailurePolicySchema = z.enum([
  "RETRY",
  "REASSIGN",
  "REPLACE_WORKER",
  "CONTINUE",
  "BLOCK_FOR_REVIEW",
  "FAIL_TEAM",
]);
export type TeamFailurePolicy = z.infer<typeof TeamFailurePolicySchema>;
