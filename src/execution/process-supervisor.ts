import {
  type ProcessLifecycleState,
  type ExecutionRequest,
} from "../domain/execution.js";
import { type EventStore } from "../event-state/event-store.js";
import { EventTypes } from "../domain/event.js";
import { killProcessTree } from "./process-tree-killer.js";

export interface ActiveExecutionHandle {
  executionId: string;
  state: ProcessLifecycleState;
  request: ExecutionRequest;
  startTime: number;
  pid?: number;
  abortController: AbortController;
  timeoutId?: NodeJS.Timeout;
}

export class ProcessSupervisor {
  private readonly activeHandles = new Map<string, ActiveExecutionHandle>();
  private readonly eventStore?: EventStore;

  constructor(options: { eventStore?: EventStore } = {}) {
    this.eventStore = options.eventStore;
  }

  public register(request: ExecutionRequest): ActiveExecutionHandle {
    if (this.activeHandles.has(request.executionId)) {
      throw new Error(`Execution handle "${request.executionId}" already exists.`);
    }

    const abortController = new AbortController();
    const handle: ActiveExecutionHandle = {
      executionId: request.executionId,
      state: "created",
      request,
      startTime: Date.now(),
      abortController,
    };

    this.activeHandles.set(request.executionId, handle);
    return handle;
  }

  public transition(
    executionId: string,
    nextState: ProcessLifecycleState,
    meta?: Record<string, unknown>
  ): void {
    const handle = this.activeHandles.get(executionId);
    if (!handle) {
      throw new Error(`Execution handle "${executionId}" not found for state transition.`);
    }

    this.validateTransition(handle.state, nextState);
    handle.state = nextState;

    if (this.eventStore && (nextState === "completed" || nextState === "failed" || nextState === "timed_out" || nextState === "cancelled")) {
      const projectId = (handle.request.metadata?.projectId as string) || "system";
      this.eventStore.append({
        id: `evt_exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        schemaVersion: 1,
        projectId,
        type: nextState === "completed" ? EventTypes.TOOL_COMPLETED : EventTypes.TOOL_FAILED,
        actor: "system",
        timestamp: new Date().toISOString(),
        payload: {
          executionId,
          state: nextState,
          command: handle.request.command,
          ...meta,
        },
      });
    }
  }

  public setPid(executionId: string, pid: number): void {
    const handle = this.activeHandles.get(executionId);
    if (handle) {
      handle.pid = pid;
    }
  }

  public setTimeout(executionId: string, timeoutId: NodeJS.Timeout): void {
    const handle = this.activeHandles.get(executionId);
    if (handle) {
      handle.timeoutId = timeoutId;
    }
  }

  public getHandle(executionId: string): ActiveExecutionHandle | undefined {
    return this.activeHandles.get(executionId);
  }

  public async cancel(executionId: string, reason = "Execution cancelled by caller"): Promise<boolean> {
    const handle = this.activeHandles.get(executionId);
    if (!handle) return false;

    if (handle.timeoutId) {
      clearTimeout(handle.timeoutId);
    }

    handle.abortController.abort();

    if (handle.pid) {
      await killProcessTree(handle.pid);
    }

    const currentHandle = this.activeHandles.get(executionId);
    if (currentHandle && currentHandle.state !== "cancelled" && currentHandle.state !== "completed") {
      this.transition(executionId, "cancelled", { reason });
    }
    return true;
  }

  public cleanup(executionId: string): void {
    const handle = this.activeHandles.get(executionId);
    if (handle?.timeoutId) {
      clearTimeout(handle.timeoutId);
    }
    this.activeHandles.delete(executionId);
  }

  public listActive(): ActiveExecutionHandle[] {
    return Array.from(this.activeHandles.values());
  }

  private validateTransition(current: ProcessLifecycleState, next: ProcessLifecycleState): void {
    const terminalStates: ProcessLifecycleState[] = ["completed", "failed", "timed_out", "cancelled", "killed", "lost"];
    if (terminalStates.includes(current) && current !== next) {
      throw new Error(`Invalid lifecycle transition from terminal state "${current}" to "${next}".`);
    }

    const validPaths: Record<ProcessLifecycleState, ProcessLifecycleState[]> = {
      created: ["starting", "cancelled", "failed"],
      starting: ["running", "failed", "timed_out", "cancelled", "killed"],
      running: ["completing", "completed", "failed", "timed_out", "cancelled", "killed", "lost"],
      completing: ["completed", "failed", "timed_out", "cancelled", "killed"],
      completed: [],
      failed: [],
      timed_out: [],
      cancelled: [],
      killed: [],
      lost: [],
    };

    if (!validPaths[current]?.includes(next)) {
      throw new Error(`Invalid lifecycle transition from "${current}" to "${next}".`);
    }
  }
}
