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
