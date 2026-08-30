import type { HarnessEvent } from "../../domain/event.js";
import { EventTypes } from "../../domain/event.js";
import type { IProjection } from "./projection.interface.js";

export interface SessionSummaryState {
  sessionId: string;
  projectId?: string;
  name?: string;
  status: "active" | "paused" | "completed" | "deleted" | "unknown";
  totalEvents: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  lastActivityAt: string;
}

export class SessionSummaryProjection implements IProjection<SessionSummaryState> {
  public readonly name = "SessionSummaryProjection";
  private states = new Map<string, SessionSummaryState>();

  public reset(): void {
    this.states.clear();
  }

  public handleEvent(event: Readonly<HarnessEvent>): void {
    if (!event.sessionId) return;

    let state = this.states.get(event.sessionId);
    if (!state) {
      state = {
        sessionId: event.sessionId,
        projectId: event.projectId,
        status: "unknown",
        totalEvents: 0,
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        lastActivityAt: event.timestamp,
      };
      this.states.set(event.sessionId, state);
    }

    state.totalEvents++;
    state.lastActivityAt = event.timestamp;
    if (event.projectId && !state.projectId) state.projectId = event.projectId;

    switch (event.type) {
      case EventTypes.SESSION_CREATED:
      case EventTypes.SESSION_FORKED:
      case EventTypes.SESSION_RESUMED:
        state.status = "active";
        if (event.payload.name) state.name = String(event.payload.name);
        break;

      case EventTypes.SESSION_RENAMED:
        if (event.payload.name) state.name = String(event.payload.name);
        break;

      case EventTypes.SESSION_PAUSED:
        state.status = "paused";
        break;

      case EventTypes.SESSION_COMPLETED:
        state.status = "completed";
        break;

      case EventTypes.SESSION_DELETED:
        state.status = "deleted";
        break;

      case EventTypes.TASK_CREATED:
        state.totalTasks++;
        break;

      case EventTypes.TASK_COMPLETED:
        state.completedTasks++;
        break;

      case EventTypes.TASK_FAILED:
        state.failedTasks++;
        break;
    }
  }

  public rebuild(events: Readonly<HarnessEvent>[]): void {
    this.reset();
    for (const event of events) {
      this.handleEvent(event);
    }
  }

  public getState(sessionId: string): SessionSummaryState | undefined {
    const s = this.states.get(sessionId);
    return s ? { ...s } : undefined;
  }

  public getAllStates(): Record<string, SessionSummaryState> {
    const res: Record<string, SessionSummaryState> = {};
    for (const [k, v] of this.states.entries()) {
      res[k] = { ...v };
    }
    return res;
  }
}
