import type { HarnessEvent } from "../domain/event.js";
import { EventRepository } from "../persistence/repositories/event-repository.js";
import type { SqliteEngine } from "../persistence/sqlite-engine.js";

export interface StreamQueryOptions {
  type?: string;
  fromTimestamp?: string;
  limit?: number;
  offset?: number;
}

export interface EventSubscriptionFilter {
  sessionId?: string;
  projectId?: string;
  type?: string;
}

export type EventListener = (event: Readonly<HarnessEvent>) => void | Promise<void>;

interface ActiveSubscription {
  id: number;
  filter: EventSubscriptionFilter;
  listener: EventListener;
}

/**
 * EventStore manages the append-only authoritative event stream,
 * provides query operations, and distributes ephemeral notifications to subscribers.
 * PRD Part 1 Section 37-40 / Tech Stack Section 5.
 */
export class EventStore {
  private readonly eventRepo: EventRepository;
  private readonly engine: SqliteEngine;
  private subscriptions: ActiveSubscription[] = [];
  private nextSubscriptionId = 1;

  constructor(engine: SqliteEngine) {
    this.engine = engine;
    this.eventRepo = new EventRepository(engine);
  }

  public get sqliteEngine(): SqliteEngine {
    return this.engine;
  }

  /**
   * Appends an immutable event within a durable transaction and notifies active subscribers.
   * Section 40: "Once committed, an authoritative event cannot be edited in place."
   */
  public append(event: HarnessEvent): Readonly<HarnessEvent> {
    // 1. Durably commit event inside SQLite transaction
    const committedEvent = this.engine.transaction(() => {
      return this.eventRepo.append(event);
    });

    // 2. Safely dispatch to subscribers (ephemeral notification; errors never break committed event)
    this.notifySubscribers(committedEvent);

    return committedEvent;
  }

  /**
   * Appends an immutable event directly within an existing caller-managed SQLite transaction.
   * Guarantees atomic RPO-0 consistency between relational table mutations and EventStore.
   */
  public appendWithinTransaction(event: HarnessEvent): Readonly<HarnessEvent> {
    return this.eventRepo.append(event);
  }

  /**
   * Safely dispatches ephemeral notifications for events committed in an outer transaction.
   */
  public notifyCommitted(events: Readonly<HarnessEvent>[]): void {
    for (const ev of events) {
      this.notifySubscribers(ev);
    }
  }


  /**
   * Reads all events for a given session in strictly chronological order.
   */
  public getEventsBySession(
    sessionId: string,
    options?: StreamQueryOptions
  ): Readonly<HarnessEvent>[] {
    return this.eventRepo.listBySession(sessionId, options);
  }

  /**
   * Reads all events for a given project in strictly chronological order.
   */
  public getEventsByProject(
    projectId: string,
    options?: StreamQueryOptions
  ): Readonly<HarnessEvent>[] {
    let sql = "SELECT * FROM events WHERE project_id = ?";
    const params: (string | number | null)[] = [projectId];

    if (options?.type) {
      sql += " AND type = ?";
      params.push(options.type);
    }
    if (options?.fromTimestamp) {
      sql += " AND timestamp >= ?";
      params.push(options.fromTimestamp);
    }
    sql += " ORDER BY timestamp ASC";

    if (options?.limit) {
      sql += " LIMIT ?";
      params.push(options.limit);
      if (options?.offset) {
        sql += " OFFSET ?";
        params.push(options.offset);
      }
    }
    sql += ";";

    const stmt = this.engine.raw.prepare(sql);
    const rows = stmt.all(...params) as unknown as Array<{
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

    // Use EventRepository's internal hydration or map directly
    return rows.map((r) => {
      const hydrated = {
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
      return Object.freeze(hydrated) as Readonly<HarnessEvent>;
    });
  }

  /**
   * Retrieves a single event by ID.
   */
  public getEventById(id: string): Readonly<HarnessEvent> | null {
    return this.eventRepo.findById(id);
  }

  /**
   * Subscribes to new committed events matching an optional filter.
   * Returns an unsubscribe function.
   */
  public subscribe(filter: EventSubscriptionFilter, listener: EventListener): () => void {
    const subId = this.nextSubscriptionId++;
    this.subscriptions.push({ id: subId, filter, listener });

    return () => {
      this.subscriptions = this.subscriptions.filter((s) => s.id !== subId);
    };
  }

  /**
   * Safely notifies subscribers. Any subscriber error is trapped and does not propagate.
   */
  private notifySubscribers(event: Readonly<HarnessEvent>): void {
    for (const sub of this.subscriptions) {
      if (sub.filter.sessionId && sub.filter.sessionId !== event.sessionId) {
        continue;
      }
      if (sub.filter.projectId && sub.filter.projectId !== event.projectId) {
        continue;
      }
      if (sub.filter.type && sub.filter.type !== event.type) {
        continue;
      }

      try {
        const res = sub.listener(event);
        if (res instanceof Promise) {
          res.catch((err) => {
            console.error(`[EventStore] Async subscriber error for event ${event.id}:`, err);
          });
        }
      } catch (err) {
        console.error(`[EventStore] Sync subscriber error for event ${event.id}:`, err);
      }
    }
  }
}
