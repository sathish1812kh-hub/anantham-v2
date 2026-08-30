import type { HarnessEvent } from "../../domain/event.js";

/**
 * Interface defining a rebuildable in-memory or persisted projection.
 * Section 6: "A projection is DERIVED STATE. Projection != authoritative history."
 */
export interface IProjection<TState = unknown> {
  readonly name: string;

  /**
   * Resets all internal projection state (e.g. before full rebuild).
   */
  reset(): void;

  /**
   * Handles a single event incrementally.
   */
  handleEvent(event: Readonly<HarnessEvent>): void;

  /**
   * Rebuilds the projection from a complete historical event log.
   */
  rebuild(events: Readonly<HarnessEvent>[]): void;

  /**
   * Retrieves current state for a given partition key (e.g. sessionId).
   */
  getState(key: string): TState | undefined;

  /**
   * Retrieves all states across all partitions.
   */
  getAllStates(): Record<string, TState>;
}
