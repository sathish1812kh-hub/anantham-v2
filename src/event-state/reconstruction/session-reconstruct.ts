import type { HarnessEvent } from "../../domain/event.js";
import { EventTypes } from "../../domain/event.js";

export interface ReconstructedSessionState {
  sessionId: string;
  projectId?: string;
  name?: string;
  branch?: string;
  status: "created" | "active" | "paused" | "completed" | "deleted" | "unknown";
  activeTaskId?: string;
  tasksCount: number;
  completedTasksCount: number;
  failedTasksCount: number;
  lastEventTimestamp?: string;
  eventCount: number;
  checkpointsCount: number;
  forkedFromSessionId?: string;
}

/**
 * Reconstructs a session's aggregate state from an immutable event stream using a pure reducer.
 * PRD Part 1 Section 37-40 / Section 56 (Resume Algorithm).
 */
export function reconstructSessionState(
  sessionId: string,
  events: Readonly<HarnessEvent>[]
): ReconstructedSessionState {
  const state: ReconstructedSessionState = {
    sessionId,
    status: "unknown",
    tasksCount: 0,
    completedTasksCount: 0,
    failedTasksCount: 0,
    eventCount: 0,
    checkpointsCount: 0,
  };

  for (const event of events) {
    if (event.sessionId && event.sessionId !== sessionId) {
      continue;
    }

    state.eventCount++;
    state.lastEventTimestamp = event.timestamp;
    if (event.projectId && !state.projectId) {
      state.projectId = event.projectId;
    }

    switch (event.type) {
      case EventTypes.SESSION_CREATED:
        state.status = "active";
        if (event.payload.name) state.name = String(event.payload.name);
        if (event.payload.branch) state.branch = String(event.payload.branch);
        break;

      case EventTypes.SESSION_RENAMED:
        if (event.payload.name) state.name = String(event.payload.name);
        break;

      case EventTypes.SESSION_FORKED:
        state.status = "active";
        if (event.payload.parentSessionId) {
          state.forkedFromSessionId = String(event.payload.parentSessionId);
        }
        if (event.payload.branch) state.branch = String(event.payload.branch);
        break;

      case EventTypes.SESSION_PAUSED:
        state.status = "paused";
        break;

      case EventTypes.SESSION_RESUMED:
        state.status = "active";
        break;

      case EventTypes.SESSION_COMPLETED:
        state.status = "completed";
        break;

      case EventTypes.SESSION_DELETED:
        state.status = "deleted";
        break;

      case EventTypes.TASK_CREATED:
        state.tasksCount++;
        break;

      case EventTypes.TASK_STARTED:
        state.activeTaskId = event.taskId;
        break;

      case EventTypes.TASK_COMPLETED:
        state.completedTasksCount++;
        if (state.activeTaskId === event.taskId) {
          state.activeTaskId = undefined;
        }
        break;

      case EventTypes.TASK_FAILED:
        state.failedTasksCount++;
        if (state.activeTaskId === event.taskId) {
          state.activeTaskId = undefined;
        }
        break;

      case EventTypes.CHECKPOINT_CREATED:
        state.checkpointsCount++;
        break;

      default:
        break;
    }
  }

  return state;
}
