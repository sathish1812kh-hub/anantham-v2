import type { HarnessEvent } from "../../domain/event.js";
import { EventTypes } from "../../domain/event.js";
import type { TaskStatus, TaskPriority } from "../../domain/task.js";

export interface SteeringRecord {
  instruction: string;
  timestamp: string;
  actor: string;
}

export interface ReconstructedTaskState {
  taskId: string;
  projectId?: string;
  sessionId?: string;
  objective?: string;
  status: TaskStatus | "unknown";
  priority?: TaskPriority;
  assignedAgent?: string;
  steeringHistory: SteeringRecord[];
  failureReason?: string;
  createdAt?: string;
  updatedAt?: string;
  eventCount: number;
}

/**
 * Reconstructs a task's aggregate state from an immutable event stream using a pure reducer.
 * PRD Part 1 Section 100-105 (Task Model & Steering).
 */
export function reconstructTaskState(
  taskId: string,
  events: Readonly<HarnessEvent>[]
): ReconstructedTaskState {
  const state: ReconstructedTaskState = {
    taskId,
    status: "unknown",
    steeringHistory: [],
    eventCount: 0,
  };

  for (const event of events) {
    if (event.taskId && event.taskId !== taskId) {
      continue;
    }

    state.eventCount++;
    state.updatedAt = event.timestamp;
    if (event.projectId && !state.projectId) state.projectId = event.projectId;
    if (event.sessionId && !state.sessionId) state.sessionId = event.sessionId;

    switch (event.type) {
      case EventTypes.TASK_CREATED:
        state.status = "queued";
        state.createdAt = event.timestamp;
        if (event.payload.objective) state.objective = String(event.payload.objective);
        if (event.payload.priority) state.priority = event.payload.priority as TaskPriority;
        if (event.payload.agentRole) state.assignedAgent = String(event.payload.agentRole);
        break;

      case EventTypes.TASK_STARTED:
        state.status = "running";
        if (event.agentId) state.assignedAgent = event.agentId;
        break;

      case EventTypes.TASK_PAUSED:
        state.status = "paused";
        break;

      case EventTypes.TASK_RESUMED:
        state.status = "running";
        break;

      case EventTypes.TASK_STEERED:
        if (event.payload.instruction) {
          state.steeringHistory.push({
            instruction: String(event.payload.instruction),
            timestamp: event.timestamp,
            actor: event.actor,
          });
        }
        break;

      case EventTypes.TASK_COMPLETED:
        state.status = "completed";
        break;

      case EventTypes.TASK_FAILED:
        state.status = "failed";
        if (event.payload.error) state.failureReason = String(event.payload.error);
        break;

      case EventTypes.TASK_CANCELLED:
        state.status = "cancelled";
        break;

      default:
        break;
    }
  }

  return state;
}
