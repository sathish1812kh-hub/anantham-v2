import { z } from "zod";

/**
 * Durable Task lifecycle status.
 * PRD Part 1 Section 100, PRD Part 2 Section 34.
 */
export const TaskStatusSchema = z.enum([
  "queued",
  "available",
  "claimed",
  "running",
  "waiting_approval",
  "waiting_resource",
  "blocked",
  "paused",
  "review",
  "verifying",
  "completed",
  "failed",
  "cancelled",
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/**
 * Task priority classification.
 * PRD Part 1 Section 102.
 */
export const TaskPrioritySchema = z.enum([
  "critical",
  "high",
  "normal",
  "low",
]);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

/**
 * Durable Task contract.
 * PRD Part 1 Section 100 (PRD-TASK-001).
 */
export const TaskSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  sessionId: z.string().min(1),
  parentId: z.string().optional(),
  objective: z.string().min(1),
  status: TaskStatusSchema,
  priority: TaskPrioritySchema,
  agentRole: z.string().optional(),
  modelProfile: z.string().optional(),
  keyPoolProfile: z.string().optional(),
  permissionProfile: z.string().optional(),
  dependencies: z.array(z.string()),
  inputArtifacts: z.array(z.string()),
  outputArtifacts: z.array(z.string()),
  checkpointId: z.string().optional(),
  readSet: z.array(z.string()).optional(),
  writeSet: z.array(z.string()).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});
export type Task = z.infer<typeof TaskSchema>;

/**
 * Allowed valid task state transitions.
 * PRD Part 1 Section 101, PRD Part 2 Section 34.
 */
const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  queued: ["available", "claimed", "cancelled", "blocked"],
  available: ["claimed", "queued", "cancelled", "blocked"],
  claimed: ["running", "queued", "available", "blocked", "cancelled", "completed", "failed"],
  running: [
    "waiting_approval",
    "waiting_resource",
    "blocked",
    "paused",
    "review",
    "verifying",
    "completed",
    "failed",
    "cancelled",
    "queued",
  ],
  waiting_approval: ["running", "blocked", "cancelled", "failed"],
  waiting_resource: ["running", "queued", "blocked", "cancelled", "failed"],
  blocked: ["queued", "available", "claimed", "running", "cancelled"],
  paused: ["running", "cancelled"],
  review: ["verifying", "completed", "failed", "running"],
  verifying: ["completed", "failed", "running"],
  completed: [], // Terminal
  failed: ["queued", "available"], // Recoverable retry creates explicit transition
  cancelled: [], // Terminal
};

/**
 * Validates whether a state transition from `currentStatus` to `nextStatus` is allowed.
 */
export function isValidTaskTransition(currentStatus: TaskStatus, nextStatus: TaskStatus): boolean {
  if (currentStatus === nextStatus) return true;
  const allowed = VALID_TRANSITIONS[currentStatus];
  return allowed ? allowed.includes(nextStatus) : false;
}

/**
 * Asserts that a state transition is valid, throwing an error if invalid.
 */
export function assertValidTaskTransition(currentStatus: TaskStatus, nextStatus: TaskStatus): void {
  if (!isValidTaskTransition(currentStatus, nextStatus)) {
    throw new Error(
      `Invalid task state transition from '${currentStatus}' to '${nextStatus}'. ` +
      `Allowed transitions: [${(VALID_TRANSITIONS[currentStatus] || []).join(", ")}]`
    );
  }
}
