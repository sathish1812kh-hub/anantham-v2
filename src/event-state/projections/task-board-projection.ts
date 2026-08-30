import type { HarnessEvent } from "../../domain/event.js";
import { EventTypes } from "../../domain/event.js";
import type { TaskStatus } from "../../domain/task.js";
import type { IProjection } from "./projection.interface.js";

export interface TaskBoardItem {
  taskId: string;
  sessionId: string;
  objective?: string;
  status: TaskStatus | "unknown";
  assignedAgent?: string;
  updatedAt: string;
}

export interface TaskBoardState {
  sessionId: string;
  queued: TaskBoardItem[];
  claimed: TaskBoardItem[];
  running: TaskBoardItem[];
  blocked: TaskBoardItem[];
  waiting_approval: TaskBoardItem[];
  paused: TaskBoardItem[];
  verifying: TaskBoardItem[];
  completed: TaskBoardItem[];
  failed: TaskBoardItem[];
  cancelled: TaskBoardItem[];
  allTasks: Map<string, TaskBoardItem>;
}

export interface TaskBoardSnapshot {
  sessionId: string;
  queued: TaskBoardItem[];
  claimed: TaskBoardItem[];
  running: TaskBoardItem[];
  blocked: TaskBoardItem[];
  waiting_approval: TaskBoardItem[];
  paused: TaskBoardItem[];
  verifying: TaskBoardItem[];
  completed: TaskBoardItem[];
  failed: TaskBoardItem[];
  cancelled: TaskBoardItem[];
  totalTasks: number;
}

export class TaskBoardProjection implements IProjection<TaskBoardSnapshot> {
  public readonly name = "TaskBoardProjection";
  private states = new Map<string, TaskBoardState>();

  private initSessionBoard(sessionId: string): TaskBoardState {
    const board: TaskBoardState = {
      sessionId,
      queued: [],
      claimed: [],
      running: [],
      blocked: [],
      waiting_approval: [],
      paused: [],
      verifying: [],
      completed: [],
      failed: [],
      cancelled: [],
      allTasks: new Map<string, TaskBoardItem>(),
    };
    this.states.set(sessionId, board);
    return board;
  }

  public reset(): void {
    this.states.clear();
  }

  public handleEvent(event: Readonly<HarnessEvent>): void {
    if (!event.sessionId || !event.taskId) return;

    let board = this.states.get(event.sessionId);
    if (!board) {
      board = this.initSessionBoard(event.sessionId);
    }

    let task = board.allTasks.get(event.taskId);
    if (!task) {
      task = {
        taskId: event.taskId,
        sessionId: event.sessionId,
        status: "unknown",
        updatedAt: event.timestamp,
      };
      board.allTasks.set(event.taskId, task);
    }

    task.updatedAt = event.timestamp;
    if (event.agentId) task.assignedAgent = event.agentId;

    switch (event.type) {
      case EventTypes.TASK_CREATED:
        task.status = "queued";
        if (event.payload.objective) task.objective = String(event.payload.objective);
        break;

      case EventTypes.TASK_STARTED:
        task.status = "running";
        break;

      case EventTypes.TASK_PAUSED:
        task.status = "paused";
        break;

      case EventTypes.TASK_RESUMED:
        task.status = "running";
        break;

      case EventTypes.TASK_COMPLETED:
        task.status = "completed";
        break;

      case EventTypes.TASK_FAILED:
        task.status = "failed";
        break;

      case EventTypes.TASK_CANCELLED:
        task.status = "cancelled";
        break;
    }

    // Refresh state buckets for the session board
    this.refreshBuckets(board);
  }

  private refreshBuckets(board: TaskBoardState): void {
    board.queued = [];
    board.claimed = [];
    board.running = [];
    board.blocked = [];
    board.waiting_approval = [];
    board.paused = [];
    board.verifying = [];
    board.completed = [];
    board.failed = [];
    board.cancelled = [];

    for (const item of board.allTasks.values()) {
      switch (item.status) {
        case "queued": board.queued.push({ ...item }); break;
        case "claimed": board.claimed.push({ ...item }); break;
        case "running": board.running.push({ ...item }); break;
        case "blocked": board.blocked.push({ ...item }); break;
        case "waiting_approval": board.waiting_approval.push({ ...item }); break;
        case "paused": board.paused.push({ ...item }); break;
        case "verifying": board.verifying.push({ ...item }); break;
        case "completed": board.completed.push({ ...item }); break;
        case "failed": board.failed.push({ ...item }); break;
        case "cancelled": board.cancelled.push({ ...item }); break;
      }
    }
  }

  public rebuild(events: Readonly<HarnessEvent>[]): void {
    this.reset();
    for (const event of events) {
      this.handleEvent(event);
    }
  }

  public getState(sessionId: string): TaskBoardSnapshot | undefined {
    const b = this.states.get(sessionId);
    if (!b) return undefined;

    return {
      sessionId: b.sessionId,
      queued: [...b.queued],
      claimed: [...b.claimed],
      running: [...b.running],
      blocked: [...b.blocked],
      waiting_approval: [...b.waiting_approval],
      paused: [...b.paused],
      verifying: [...b.verifying],
      completed: [...b.completed],
      failed: [...b.failed],
      cancelled: [...b.cancelled],
      totalTasks: b.allTasks.size,
    };
  }

  public getAllStates(): Record<string, TaskBoardSnapshot> {
    const res: Record<string, TaskBoardSnapshot> = {};
    for (const key of this.states.keys()) {
      const snap = this.getState(key);
      if (snap) res[key] = snap;
    }
    return res;
  }
}
