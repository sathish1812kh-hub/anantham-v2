import type { HarnessEvent } from "../../domain/event.js";
import type { EventStore } from "../event-store.js";
import type { IProjection } from "./projection.interface.js";
import { SessionSummaryProjection } from "./session-summary-projection.js";
import { TaskBoardProjection } from "./task-board-projection.js";

/**
 * ProjectionManager registers, routes events to, and rebuilds all derived state projections.
 * PRD Part 1 Section 37 / Tech Stack Section 5.
 */
export class ProjectionManager {
  private readonly eventStore: EventStore;
  private readonly projections = new Map<string, IProjection>();
  private unsubscribeFromStore: (() => void) | null = null;

  public readonly sessionSummary: SessionSummaryProjection;
  public readonly taskBoard: TaskBoardProjection;

  constructor(eventStore: EventStore) {
    this.eventStore = eventStore;

    // Register built-in default projections
    this.sessionSummary = new SessionSummaryProjection();
    this.taskBoard = new TaskBoardProjection();

    this.register(this.sessionSummary);
    this.register(this.taskBoard);

    // Subscribe to all incoming committed events from EventStore
    this.initSubscription();
  }

  private initSubscription(): void {
    this.unsubscribeFromStore = this.eventStore.subscribe({}, (event) => {
      this.handleEvent(event);
    });
  }

  public register(projection: IProjection): void {
    this.projections.set(projection.name, projection);
  }

  public getProjection<T extends IProjection>(name: string): T | undefined {
    return this.projections.get(name) as T | undefined;
  }

  public handleEvent(event: Readonly<HarnessEvent>): void {
    for (const proj of this.projections.values()) {
      try {
        proj.handleEvent(event);
      } catch (err) {
        console.error(`[ProjectionManager] Error updating projection '${proj.name}':`, err);
      }
    }
  }

  /**
   * Rebuilds all registered projections for a specific session by querying authoritative event history.
   * Section 6: "The implementation must support: 1. build projection; 2. query projection;
   * 3. delete/recreate projection; 4. replay events; 5. rebuild projection; 6. verify equivalent result."
   */
  public rebuildSession(sessionId: string): void {
    const events = this.eventStore.getEventsBySession(sessionId);
    for (const proj of this.projections.values()) {
      proj.rebuild(events);
    }
  }

  /**
   * Rebuilds all projections across all projects and sessions.
   */
  public rebuildAll(): void {
    // Reset all projections
    for (const proj of this.projections.values()) {
      proj.reset();
    }

    // Retrieve all events from SQLite and replay
    const stmt = this.eventStore.sqliteEngine.raw.prepare(
      "SELECT * FROM events ORDER BY timestamp ASC;"
    );
    const rows = stmt.all() as unknown as Array<{
      id: string;
      schema_version: number;
      project_id: string | null;
      session_id: string | null;
      task_id: string | null;
      agent_id: string | null;
      type: string;
      actor: string;
      timestamp: string;
      payload_json: string;
      correlation_id: string | null;
      parent_event_id: string | null;
    }>;

    for (const r of rows) {
      const event: HarnessEvent = {
        id: r.id,
        schemaVersion: r.schema_version,
        projectId: r.project_id ?? undefined,
        sessionId: r.session_id ?? undefined,
        taskId: r.task_id ?? undefined,
        agentId: r.agent_id ?? undefined,
        type: r.type,
        actor: r.actor as HarnessEvent["actor"],
        timestamp: r.timestamp,
        payload: JSON.parse(r.payload_json),
        correlationId: r.correlation_id ?? undefined,
        parentEventId: r.parent_event_id ?? undefined,
      };

      for (const proj of this.projections.values()) {
        proj.handleEvent(Object.freeze(event));
      }
    }
  }

  public dispose(): void {
    if (this.unsubscribeFromStore) {
      this.unsubscribeFromStore();
      this.unsubscribeFromStore = null;
    }
  }
}
