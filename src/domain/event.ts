import { z } from "zod";

/**
 * Authoritative actor categories.
 * PRD Part 1 Section 38.
 */
export const ActorTypeSchema = z.enum([
  "user",
  "agent",
  "system",
  "tool",
  "mcp",
  "verifier",
]);
export type ActorType = z.infer<typeof ActorTypeSchema>;

/**
 * Canonical event type constants.
 * PRD Part 1 Section 39.
 */
export const EventTypes = {
  // Session lifecycle
  SESSION_CREATED: "session.created",
  SESSION_RENAMED: "session.renamed",
  SESSION_FORKED: "session.forked",
  SESSION_RESUMED: "session.resumed",
  SESSION_PAUSED: "session.paused",
  SESSION_COMPLETED: "session.completed",
  SESSION_DELETED: "session.deleted",

  // Task lifecycle
  TASK_CREATED: "task.created",
  TASK_STARTED: "task.started",
  TASK_CLAIM_REQUESTED: "task.claim_requested",
  TASK_CLAIMED: "task.claimed",
  TASK_LEASE_ACQUIRED: "task.lease_acquired",
  TASK_HEARTBEAT: "task.heartbeat",
  TASK_LEASE_RENEWED: "task.lease_renewed",
  TASK_LEASE_EXPIRED: "task.lease_expired",
  TASK_RECLAIMED: "task.reclaimed",
  TASK_RELEASED: "task.released",
  TASK_PAUSED: "task.paused",
  TASK_RESUMED: "task.resumed",
  TASK_STEERED: "task.steered",
  TASK_CANCELLED: "task.cancelled",
  TASK_COMPLETED: "task.completed",
  TASK_FAILED: "task.failed",

  // Model plane
  MODEL_REQUESTED: "model.requested",
  MODEL_RESPONDED: "model.responded",
  MODEL_FAILED: "model.failed",

  // Tool plane
  TOOL_REQUESTED: "tool.requested",
  TOOL_APPROVED: "tool.approved",
  TOOL_DENIED: "tool.denied",
  TOOL_COMPLETED: "tool.completed",
  TOOL_FAILED: "tool.failed",

  // Side effect plane
  SIDE_EFFECT_REQUESTED: "side_effect.requested",
  SIDE_EFFECT_STARTED: "side_effect.started",
  SIDE_EFFECT_COMPLETED: "side_effect.completed",
  SIDE_EFFECT_FAILED: "side_effect.failed",
  SIDE_EFFECT_UNKNOWN: "side_effect.unknown",
  SIDE_EFFECT_DIVERGENCE: "side_effect.divergence",

  // MCP plane
  MCP_REGISTERED: "mcp.registered",
  MCP_DEREGISTERED: "mcp.deregistered",
  MCP_CONNECTED: "mcp.connected",
  MCP_DISCONNECTED: "mcp.disconnected",
  MCP_DISCOVERED: "mcp.discovered",
  MCP_HEALTH_CHANGED: "mcp.health_changed",
  MCP_CIRCUIT_BROKEN: "mcp.circuit_broken",
  MCP_TOOL_CALLED: "mcp.tool.called",
  MCP_RESOURCE_READ: "mcp.resource.read",
  MCP_PROMPT_RETRIEVED: "mcp.prompt.retrieved",
  MCP_FAILED: "mcp.failed",

  // Plugin plane
  PLUGIN_DISCOVERED: "plugin.discovered",
  PLUGIN_INSPECTED: "plugin.inspected",
  PLUGIN_VALIDATED: "plugin.validated",
  PLUGIN_INSTALLED: "plugin.installed",
  PLUGIN_ACTIVATED: "plugin.activated",
  PLUGIN_DEACTIVATED: "plugin.deactivated",
  PLUGIN_DISABLED: "plugin.disabled",
  PLUGIN_UNLOADED: "plugin.unloaded",
  PLUGIN_RELOADED: "plugin.reloaded",
  PLUGIN_UPDATED: "plugin.updated",
  PLUGIN_ROLLED_BACK: "plugin.rolled_back",
  PLUGIN_HEALTH_CHANGED: "plugin.health_changed",
  PLUGIN_FAILED: "plugin.failed",

  // Skill plane
  SKILL_DISCOVERED: "skill.discovered",
  SKILL_VALIDATED: "skill.validated",
  SKILL_INSTALLED: "skill.installed",
  SKILL_ENABLED: "skill.enabled",
  SKILL_DISABLED: "skill.disabled",
  SKILL_LOADED: "skill.loaded",
  SKILL_EXECUTED: "skill.executed",
  SKILL_TESTED: "skill.tested",
  SKILL_RELOADED: "skill.reloaded",
  SKILL_FAILED: "skill.failed",
  SKILL_REMOVED: "skill.removed",

  // Hook plane
  HOOK_REGISTERED: "hook.registered",
  HOOK_VALIDATED: "hook.validated",
  HOOK_ENABLED: "hook.enabled",
  HOOK_DISABLED: "hook.disabled",
  HOOK_TRIGGERED: "hook.triggered",
  HOOK_STARTED: "hook.started",
  HOOK_COMPLETED: "hook.completed",
  HOOK_FAILED: "hook.failed",
  HOOK_TIMED_OUT: "hook.timed_out",
  HOOK_BLOCKED: "hook.blocked",
  HOOK_REMOVED: "hook.removed",

  // Agent plane
  AGENT_REGISTERED: "agent.registered",
  AGENT_CONFIGURED: "agent.configured",
  AGENT_RESOLVING: "agent.resolving",
  AGENT_READY: "agent.ready",
  AGENT_STARTED: "agent.started",
  AGENT_PAUSED: "agent.paused",
  AGENT_RESUMED: "agent.resumed",
  AGENT_BLOCKED: "agent.blocked",
  AGENT_FAILED: "agent.failed",
  AGENT_COMPLETED: "agent.completed",
  AGENT_STOPPED: "agent.stopped",
  AGENT_REMOVED: "agent.removed",

  // Subagent & Team plane
  SUBAGENT_SPAWNED: "subagent.spawned",
  SUBAGENT_DELEGATED: "subagent.delegated",
  SUBAGENT_COMPLETED: "subagent.completed",
  SUBAGENT_FAILED: "subagent.failed",
  TEAM_CREATED: "team.created",
  TEAM_UPDATED: "team.updated",
  TEAM_STARTED: "team.started",
  TEAM_PAUSED: "team.paused",
  TEAM_COMPLETED: "team.completed",
  TEAM_CANCELLED: "team.cancelled",
  TEAM_MEMBER_JOINED: "team.member.joined",
  TEAM_MEMBER_LEFT: "team.member.left",
  PEER_MESSAGE_SENT: "peer.message.sent",
  HANDOFF_PREPARED: "handoff.prepared",
  HANDOFF_ACCEPTED: "handoff.accepted",
  HANDOFF_REJECTED: "handoff.rejected",

  // Workspace & Parallel Execution plane
  WORKSPACE_CREATED: "workspace.created",
  WORKSPACE_ACTIVATED: "workspace.activated",
  WORKSPACE_CHANGED: "workspace.changed",
  WORKSPACE_CONFLICT_DETECTED: "workspace.conflict_detected",
  WORKSPACE_INTEGRATION_STARTED: "workspace.integration_started",
  WORKSPACE_INTEGRATED: "workspace.integrated",
  WORKSPACE_INTEGRATION_REJECTED: "workspace.integration_rejected",
  WORKSPACE_QUARANTINED: "workspace.quarantined",
  WORKSPACE_RECOVERED: "workspace.recovered",
  WORKSPACE_CLEANED: "workspace.cleaned",
  WORKSPACE_FAILED: "workspace.failed",

  // Workflow & Orchestration plane
  WORKFLOW_REGISTERED: "workflow.registered",
  WORKFLOW_VALIDATED: "workflow.validated",
  WORKFLOW_STARTED: "workflow.started",
  WORKFLOW_PAUSED: "workflow.paused",
  WORKFLOW_RESUMED: "workflow.resumed",
  WORKFLOW_TASK_STARTED: "workflow.task_started",
  WORKFLOW_TASK_COMPLETED: "workflow.task_completed",
  WORKFLOW_TASK_FAILED: "workflow.task_failed",
  WORKFLOW_CONDITION_EVALUATED: "workflow.condition_evaluated",
  WORKFLOW_COMPLETED: "workflow.completed",
  WORKFLOW_FAILED: "workflow.failed",
  WORKFLOW_CANCELLED: "workflow.cancelled",

  // Background Job & Detached Execution plane (P7.3)
  JOB_CREATED: "job.created",
  JOB_QUEUED: "job.queued",
  JOB_CLAIMED: "job.claimed",
  JOB_STARTED: "job.started",
  JOB_HEARTBEAT: "job.heartbeat",
  JOB_CHECKPOINTED: "job.checkpointed",
  JOB_CANCEL_REQUESTED: "job.cancel_requested",
  JOB_CANCELLED: "job.cancelled",
  JOB_TIMED_OUT: "job.timed_out",
  JOB_RECLAIMED: "job.reclaimed",
  JOB_RETRYING: "job.retrying",
  JOB_COMPLETED: "job.completed",
  JOB_FAILED: "job.failed",
  JOB_RECOVERY_REQUIRED: "job.recovery_required",

  // Remote & Multi-Node Execution plane (P7.4)
  NODE_REGISTERED: "node.registered",
  NODE_CONNECTED: "node.connected",
  NODE_DISCONNECTED: "node.disconnected",
  NODE_HEARTBEAT: "node.heartbeat",
  NODE_DRAINING: "node.draining",
  NODE_QUARANTINED: "node.quarantined",
  DISPATCH_CREATED: "dispatch.created",
  DISPATCH_SENT: "dispatch.sent",
  DISPATCH_ACCEPTED: "dispatch.accepted",
  DISPATCH_REJECTED: "dispatch.rejected",
  DISPATCH_COMPLETED: "dispatch.completed",
  DISPATCH_FAILED: "dispatch.failed",
  DISPATCH_TIMED_OUT: "dispatch.timed_out",
  DISPATCH_RECLAIMED: "dispatch.reclaimed",
  REMOTE_RESULT_RECEIVED: "remote.result_received",
  REMOTE_RESULT_REJECTED: "remote.result_rejected",
  REMOTE_SPLIT_BRAIN_DETECTED: "remote.split_brain_detected",

  // Checkpoint plane
  CHECKPOINT_CREATED: "checkpoint.created",
  CHECKPOINT_RESTORED: "checkpoint.restored",
  CHECKPOINT_INVALIDATED: "checkpoint.invalidated",

  // Context plane
  CONTEXT_BUILT: "context.built",
  CONTEXT_COMPACTED: "context.compacted",

  // Memory plane
  MEMORY_PROPOSED: "memory.proposed",
  MEMORY_WRITTEN: "memory.written",
  MEMORY_DELETED: "memory.deleted",
  MEMORY_INVALIDATED: "memory.invalidated",

  // Artifact plane
  ARTIFACT_CREATED: "artifact.created",
  ARTIFACT_UPDATED: "artifact.updated",

  // Verification plane
  VERIFICATION_STARTED: "verification.started",
  VERIFICATION_COMPLETED: "verification.completed",
  VERIFICATION_FAILED: "verification.failed",

  // Integration plane
  INTEGRATION_REGISTERED: "integration.registered",
  INTEGRATION_WEBHOOK_RECEIVED: "integration.webhook_received",
  INTEGRATION_WEBHOOK_DELIVERED: "integration.webhook_delivered",
  INTEGRATION_WEBHOOK_FAILED: "integration.webhook_failed",
  INTEGRATION_CICD_TRIGGERED: "integration.cicd_triggered",
} as const;

export type EventType = (typeof EventTypes)[keyof typeof EventTypes] | (string & {});

/**
 * Authoritative HarnessEvent contract.
 * PRD Part 1 Section 38.
 */
export const HarnessEventSchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  projectId: z.string().optional(),
  sessionId: z.string().optional(),
  taskId: z.string().optional(),
  agentId: z.string().optional(),
  type: z.string().min(1),
  actor: ActorTypeSchema,
  timestamp: z.string().min(1),
  payload: z.record(z.unknown()),
  correlationId: z.string().optional(),
  parentEventId: z.string().optional(),
});
export type HarnessEvent = z.infer<typeof HarnessEventSchema>;

/**
 * Enforces deep immutability on a committed HarnessEvent.
 * Section 40: "Once committed, an authoritative event cannot be edited in place."
 */
export function freezeEvent<T extends HarnessEvent>(event: T): Readonly<T> {
  const deepFreeze = (obj: unknown): unknown => {
    if (obj === null || typeof obj !== "object" || Object.isFrozen(obj)) {
      return obj;
    }
    Object.freeze(obj);
    for (const key of Object.keys(obj)) {
      const val = (obj as Record<string, unknown>)[key];
      if (val !== null && typeof val === "object") {
        deepFreeze(val);
      }
    }
    return obj;
  };

  return deepFreeze(structuredClone(event)) as Readonly<T>;
}

/**
 * Verifies if an event is frozen.
 */
export function isEventFrozen(event: HarnessEvent): boolean {
  return Object.isFrozen(event) && Object.isFrozen(event.payload);
}
