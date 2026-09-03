import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { SqliteEngine } from "../persistence/sqlite-engine.js";
import { EventStore } from "./event-store.js";
import { ProjectionManager } from "./projections/projection-manager.js";
import { reconstructSessionState } from "./reconstruction/session-reconstruct.js";
import { reconstructTaskState } from "./reconstruction/task-reconstruct.js";

export const TaskStateSnapshotSchema = z.object({
  id: z.string(),
  status: z.string(),
  priority: z.string(),
  objective: z.string(),
  agentRole: z.string().optional(),
  assignedAgentId: z.string().optional(),
  checkpointId: z.string().optional(),
  dependencies: z.array(z.string()).default([]),
  updatedAt: z.string(),
});
export type TaskStateSnapshot = z.infer<typeof TaskStateSnapshotSchema>;

export const SessionStateSnapshotSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  branch: z.string(),
  status: z.string(),
  currentTaskId: z.string().optional(),
  updatedAt: z.string(),
});
export type SessionStateSnapshot = z.infer<typeof SessionStateSnapshotSchema>;

export interface SnapshotDeltaDiff {
  addedTasks: Record<string, TaskStateSnapshot>;
  updatedTasks: Record<string, { before: Partial<TaskStateSnapshot>; after: Partial<TaskStateSnapshot> }>;
  removedTaskIds: string[];
  sessionChanges: Record<string, { before: unknown; after: unknown }>;
  projectionDeltas?: Record<string, unknown>;
}

export const ProjectionDeltaSnapshotSchema = z.object({
  snapshotId: z.string().min(1),
  sessionId: z.string().min(1),
  projectId: z.string().min(1),
  eventSequenceNumber: z.number().int().nonnegative(),
  lastEventId: z.string().min(1),
  timestamp: z.string().min(1),
  isKeyframe: z.boolean(),
  baseSnapshotId: z.string().optional(),
  sessionState: SessionStateSnapshotSchema,
  taskStates: z.record(z.string(), TaskStateSnapshotSchema),
  projections: z.record(z.string(), z.unknown()),
  deltaDiff: z.custom<SnapshotDeltaDiff>().optional(),
  checksum: z.string().length(64),
});
export type ProjectionDeltaSnapshot = z.infer<typeof ProjectionDeltaSnapshotSchema>;

export interface ReconstructedSnapshotState {
  sessionId: string;
  projectId: string;
  targetSequenceNumber: number;
  lastEventId: string;
  sessionState: SessionStateSnapshot;
  taskStates: Record<string, TaskStateSnapshot>;
  projections: Record<string, unknown>;
  reconstructedFromKeyframeId: string;
  appliedDeltaCount: number;
  replayedEventsCount: number;
}

export interface RollbackOptions {
  dryRun?: boolean;
  reason?: string;
  actor?: "user" | "system" | "agent";
}

export interface RollbackResult {
  success: boolean;
  sessionId: string;
  targetSequenceNumber: number;
  targetEventId: string;
  previousSequenceNumber: number;
  discardedEventsCount: number;
  reconstructedState: ReconstructedSnapshotState;
  compensationEventId?: string;
  durationMs: number;
}

export interface DeltaSnapshotManagerOptions {
  engine: SqliteEngine;
  eventStore: EventStore;
  projectionManager?: ProjectionManager;
  keyframeInterval?: number;
}

export class DeltaSnapshotManager {
  private readonly engine: SqliteEngine;
  private readonly eventStore: EventStore;
  private readonly projectionManager?: ProjectionManager;
  private readonly keyframeInterval: number;

  constructor(options: DeltaSnapshotManagerOptions) {
    this.engine = options.engine;
    this.eventStore = options.eventStore;
    this.projectionManager = options.projectionManager;
    this.keyframeInterval = options.keyframeInterval ?? 20;
  }

  private computeChecksum(data: unknown): string {
    return createHash("sha256").update(JSON.stringify(data)).digest("hex");
  }

  public async captureSnapshot(sessionId: string, options?: { forceKeyframe?: boolean }): Promise<ProjectionDeltaSnapshot> {
    const events = this.eventStore.getEventsBySession(sessionId);
    if (events.length === 0) {
      throw new Error("Cannot capture snapshot for session with zero events: " + sessionId);
    }

    const lastEvent = events[events.length - 1];
    if (!lastEvent) {
      throw new Error("No events in session");
    } if (!lastEvent) throw new Error("No events found for session");
    const eventSequenceNumber = events.length;
    const lastEventId = lastEvent.id;
    const projectId = lastEvent.projectId ?? "prj_default";

    // Reconstruct states from events
    const sessionAgg = reconstructSessionState(sessionId, events);
    const sessionState: SessionStateSnapshot = {
      id: sessionId,
      projectId: sessionAgg.projectId ?? projectId,
      name: sessionAgg.name ?? "unnamed_session",
      branch: sessionAgg.branch ?? "main",
      status: sessionAgg.status,
      currentTaskId: sessionAgg.activeTaskId,
      updatedAt: sessionAgg.lastEventTimestamp ?? new Date().toISOString(),
    };

    // Reconstruct all task states from events
    const taskIds = new Set<string>();
    for (const ev of events) {
      if (ev.taskId) taskIds.add(ev.taskId);
    }
    const taskStates: Record<string, TaskStateSnapshot> = {};
    for (const tid of taskIds) {
      const taskAgg = reconstructTaskState(tid, events);
      taskStates[tid] = {
        id: tid,
        status: taskAgg.status,
        priority: taskAgg.priority ?? "normal",
        objective: taskAgg.objective ?? "Task " + tid,
        agentRole: taskAgg.assignedAgent,
        assignedAgentId: taskAgg.assignedAgent,
        dependencies: [],
        updatedAt: taskAgg.updatedAt ?? new Date().toISOString(),
      };
    }

    // Determine keyframe status
    const previousSnapshots = await this.listSnapshots(sessionId);
    const isFirst = previousSnapshots.length === 0;
    const isKeyframe = options?.forceKeyframe || isFirst || (previousSnapshots.length % this.keyframeInterval === 0);

    let baseSnapshotId: string | undefined;
    let deltaDiff: SnapshotDeltaDiff | undefined;

    if (!isKeyframe && previousSnapshots.length > 0) {
      const prev = previousSnapshots[previousSnapshots.length - 1];
      if (prev) {
        baseSnapshotId = prev.snapshotId;

      const addedTasks: Record<string, TaskStateSnapshot> = {};
      const updatedTasks: Record<string, { before: Partial<TaskStateSnapshot>; after: Partial<TaskStateSnapshot> }> = {};
      const removedTaskIds: string[] = [];

      for (const [tid, currentT] of Object.entries(taskStates)) {
        const prevT = prev.taskStates[tid];
        if (!prevT) {
          addedTasks[tid] = currentT;
        } else if (JSON.stringify(prevT) !== JSON.stringify(currentT)) {
          updatedTasks[tid] = { before: prevT, after: currentT };
        }
      }

      for (const prevTid of Object.keys(prev.taskStates)) {
        if (!taskStates[prevTid]) {
          removedTaskIds.push(prevTid);
        }
      }

      const sessionChanges: Record<string, { before: unknown; after: unknown }> = {};
      for (const [k, v] of Object.entries(sessionState)) {
        const prevVal = (prev.sessionState as any)[k];
        if (prevVal !== v) {
          sessionChanges[k] = { before: prevVal, after: v };
        }
      }

      deltaDiff = {
        addedTasks,
        updatedTasks,
        removedTaskIds,
        sessionChanges,
      };
      }
    }

    const snapshotId = "snp_" + Date.now() + "_" + randomBytes(4).toString("hex");
    const timestamp = new Date().toISOString();
    const projections: Record<string, unknown> = {};

    const rawPayload = {
      snapshotId,
      sessionId,
      projectId,
      eventSequenceNumber,
      lastEventId,
      timestamp,
      isKeyframe,
      baseSnapshotId,
      sessionState,
      taskStates,
      projections,
    };

    const checksum = this.computeChecksum(rawPayload);

    const snapshot: ProjectionDeltaSnapshot = {
      ...rawPayload,
      deltaDiff,
      checksum,
    };

    // Persist to database
    try {
      const stmt = this.engine.raw.prepare(`
        INSERT INTO projection_snapshots (
          id, session_id, project_id, event_sequence_number, last_event_id, timestamp,
          is_keyframe, base_snapshot_id, session_state_json, task_states_json,
          projections_json, delta_diff_json, checksum, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `);
      stmt.run(
        snapshot.snapshotId,
        snapshot.sessionId,
        snapshot.projectId,
        snapshot.eventSequenceNumber,
        snapshot.lastEventId,
        snapshot.timestamp,
        snapshot.isKeyframe ? 1 : 0,
        snapshot.baseSnapshotId ?? null,
        JSON.stringify(snapshot.sessionState),
        JSON.stringify(snapshot.taskStates),
        JSON.stringify(snapshot.projections),
        snapshot.deltaDiff ? JSON.stringify(snapshot.deltaDiff) : null,
        snapshot.checksum,
        snapshot.timestamp
      );
    } catch {
      // In-memory or fallback
    }

    return snapshot;
  }

  public async getSnapshot(snapshotId: string): Promise<ProjectionDeltaSnapshot | null> {
    try {
      const row = this.engine.raw.prepare("SELECT * FROM projection_snapshots WHERE id = ?;").get(snapshotId) as any;
      if (!row) return null;

      return {
        snapshotId: row.id,
        sessionId: row.session_id,
        projectId: row.project_id,
        eventSequenceNumber: Number(row.event_sequence_number),
        lastEventId: row.last_event_id,
        timestamp: row.timestamp,
        isKeyframe: Boolean(row.is_keyframe),
        baseSnapshotId: row.base_snapshot_id ?? undefined,
        sessionState: JSON.parse(row.session_state_json),
        taskStates: JSON.parse(row.task_states_json),
        projections: JSON.parse(row.projections_json),
        deltaDiff: row.delta_diff_json ? JSON.parse(row.delta_diff_json) : undefined,
        checksum: row.checksum,
      };
    } catch {
      return null;
    }
  }

  public async listSnapshots(sessionId: string): Promise<ProjectionDeltaSnapshot[]> {
    try {
      const rows = this.engine.raw.prepare("SELECT * FROM projection_snapshots WHERE session_id = ? ORDER BY event_sequence_number ASC;").all(sessionId) as any[];
      return rows.map((row) => ({
        snapshotId: row.id,
        sessionId: row.session_id,
        projectId: row.project_id,
        eventSequenceNumber: Number(row.event_sequence_number),
        lastEventId: row.last_event_id,
        timestamp: row.timestamp,
        isKeyframe: Boolean(row.is_keyframe),
        baseSnapshotId: row.base_snapshot_id ?? undefined,
        sessionState: JSON.parse(row.session_state_json),
        taskStates: JSON.parse(row.task_states_json),
        projections: JSON.parse(row.projections_json),
        deltaDiff: row.delta_diff_json ? JSON.parse(row.delta_diff_json) : undefined,
        checksum: row.checksum,
      }));
    } catch {
      return [];
    }
  }

  public async reconstructStateAt(
    sessionId: string,
    target: { sequenceNumber?: number; eventId?: string; timestamp?: string }
  ): Promise<ReconstructedSnapshotState> {
    const allEvents = this.eventStore.getEventsBySession(sessionId);
    if (allEvents.length === 0) {
      throw new Error("No events found for session: " + sessionId);
    }

    let targetSeq = allEvents.length;
    let initialEvent = allEvents[allEvents.length - 1];
    if (!initialEvent) {
      throw new Error("No events found in session history");
    }
    let targetEvent = initialEvent;

    if (typeof target.sequenceNumber === "number") {
      targetSeq = Math.max(1, Math.min(target.sequenceNumber, allEvents.length));
      const ev = allEvents[targetSeq - 1];
      if (ev) targetEvent = ev;
    } else if (target.eventId) {
      const idx = allEvents.findIndex((e) => e.id === target.eventId);
      if (idx === -1) {
        throw new Error("Event ID not found in session history: " + target.eventId);
      }
      targetSeq = idx + 1;
      const ev = allEvents[idx];
      if (ev) targetEvent = ev;
    } else if (target.timestamp) {
      const idx = allEvents.findIndex((e) => e.timestamp >= (target.timestamp as string));
      if (idx !== -1) {
        targetSeq = idx + 1;
        const ev = allEvents[idx];
        if (ev) targetEvent = ev;
      }
    }

    const snapshots = await this.listSnapshots(sessionId);
    // Find nearest preceding keyframe with valid checksum
    const eligibleKeyframes = snapshots
      .filter((s) => s.eventSequenceNumber <= targetSeq && s.isKeyframe)
      .sort((a, b) => b.eventSequenceNumber - a.eventSequenceNumber);

    let chosenKeyframe = eligibleKeyframes[0];
    // Verify checksum
    if (chosenKeyframe) {
      const expectedPayload = {
        snapshotId: chosenKeyframe.snapshotId,
        sessionId: chosenKeyframe.sessionId,
        projectId: chosenKeyframe.projectId,
        eventSequenceNumber: chosenKeyframe.eventSequenceNumber,
        lastEventId: chosenKeyframe.lastEventId,
        timestamp: chosenKeyframe.timestamp,
        isKeyframe: chosenKeyframe.isKeyframe,
        baseSnapshotId: chosenKeyframe.baseSnapshotId,
        sessionState: chosenKeyframe.sessionState,
        taskStates: chosenKeyframe.taskStates,
        projections: chosenKeyframe.projections,
      };
      const check = this.computeChecksum(expectedPayload);
      if (check !== chosenKeyframe.checksum) {
        // Tampered keyframe! Fall back to earlier valid or genesis
        chosenKeyframe = eligibleKeyframes.find((k) => this.computeChecksum({
          snapshotId: k.snapshotId,
          sessionId: k.sessionId,
          projectId: k.projectId,
          eventSequenceNumber: k.eventSequenceNumber,
          lastEventId: k.lastEventId,
          timestamp: k.timestamp,
          isKeyframe: k.isKeyframe,
          baseSnapshotId: k.baseSnapshotId,
          sessionState: k.sessionState,
          taskStates: k.taskStates,
          projections: k.projections,
        }) === k.checksum) as any;
      }
    }

    let sessionState: SessionStateSnapshot;
    let taskStates: Record<string, TaskStateSnapshot> = {};
    let projections: Record<string, unknown> = {};
    let appliedDeltaCount = 0;
    let lastAppliedSeq = 0;
    const keyframeId = chosenKeyframe ? chosenKeyframe.snapshotId : "genesis";

    if (chosenKeyframe) {
      sessionState = { ...chosenKeyframe.sessionState };
      taskStates = JSON.parse(JSON.stringify(chosenKeyframe.taskStates));
      projections = { ...chosenKeyframe.projections };
      lastAppliedSeq = chosenKeyframe.eventSequenceNumber;

      // Apply intermediate deltas up to targetSeq
      const intermediateDeltas = snapshots
        .filter((s) => s.eventSequenceNumber > chosenKeyframe.eventSequenceNumber && s.eventSequenceNumber <= targetSeq)
        .sort((a, b) => a.eventSequenceNumber - b.eventSequenceNumber);

      for (const d of intermediateDeltas) {
        if (d.deltaDiff) {
          // Apply task changes
          for (const [tid, taskSnap] of Object.entries(d.deltaDiff.addedTasks)) {
            taskStates[tid] = { ...taskSnap };
          }
          for (const [tid, change] of Object.entries(d.deltaDiff.updatedTasks)) {
            taskStates[tid] = { ...taskStates[tid], ...change.after } as TaskStateSnapshot;
          }
          for (const tid of d.deltaDiff.removedTaskIds) {
            delete taskStates[tid];
          }
          // Apply session changes
          for (const [k, change] of Object.entries(d.deltaDiff.sessionChanges)) {
            (sessionState as any)[k] = change.after;
          }
          appliedDeltaCount++;
          lastAppliedSeq = d.eventSequenceNumber;
        }
      }
    } else {
      // Genesis replay
      sessionState = {
        id: sessionId,
        projectId: targetEvent.projectId ?? "prj_default",
        name: "unnamed_session",
        branch: "main",
        status: "active",
        updatedAt: new Date().toISOString(),
      };
    }

    // Replay any events remaining between lastAppliedSeq and targetSeq
    const remainingEvents = allEvents.slice(lastAppliedSeq, targetSeq);
    if (remainingEvents.length > 0) {
      const fullTargetEvents = allEvents.slice(0, targetSeq);
      const sessionAgg = reconstructSessionState(sessionId, fullTargetEvents);
      sessionState.status = sessionAgg.status;
      if (sessionAgg.name) sessionState.name = sessionAgg.name;
      if (sessionAgg.branch) sessionState.branch = sessionAgg.branch;
      sessionState.currentTaskId = sessionAgg.activeTaskId;
      sessionState.updatedAt = sessionAgg.lastEventTimestamp ?? sessionState.updatedAt;

      const taskIds = new Set<string>();
      for (const ev of fullTargetEvents) {
        if (ev.taskId) taskIds.add(ev.taskId);
      }
      for (const tid of taskIds) {
        const taskAgg = reconstructTaskState(tid, fullTargetEvents);
        taskStates[tid] = {
          id: tid,
          status: taskAgg.status,
          priority: taskAgg.priority ?? "normal",
          objective: taskAgg.objective ?? "Task " + tid,
          agentRole: taskAgg.assignedAgent,
          assignedAgentId: taskAgg.assignedAgent,
          dependencies: [],
          updatedAt: taskAgg.updatedAt ?? new Date().toISOString(),
        };
      }
    }

    return {
      sessionId,
      projectId: sessionState.projectId,
      targetSequenceNumber: targetSeq,
      lastEventId: targetEvent.id,
      sessionState,
      taskStates,
      projections,
      reconstructedFromKeyframeId: keyframeId,
      appliedDeltaCount,
      replayedEventsCount: remainingEvents.length,
    };
  }

  public async rollbackTo(
    sessionId: string,
    target: { sequenceNumber?: number; eventId?: string },
    options?: RollbackOptions
  ): Promise<RollbackResult> {
    const startTime = Date.now();
    const allEvents = this.eventStore.getEventsBySession(sessionId);
    const previousSequenceNumber = allEvents.length;

    const reconstructedState = await this.reconstructStateAt(sessionId, target);
    const discardedEventsCount = Math.max(0, previousSequenceNumber - reconstructedState.targetSequenceNumber);

    if (options?.dryRun) {
      return {
        success: true,
        sessionId,
        targetSequenceNumber: reconstructedState.targetSequenceNumber,
        targetEventId: reconstructedState.lastEventId,
        previousSequenceNumber,
        discardedEventsCount,
        reconstructedState,
        durationMs: Date.now() - startTime,
      };
    }

    // Reset projections if manager exists
    if (this.projectionManager) {
      this.projectionManager.rebuildAll();
    }

    // Append session.rolled_back compensation event to EventStore (NEVER delete historical events)
    const compensationEventId = "evt_rb_" + Date.now() + "_" + randomBytes(4).toString("hex");
    const rolledBackEvent = this.eventStore.append({
      id: compensationEventId,
      schemaVersion: 1,
      projectId: reconstructedState.projectId,
      sessionId,
      type: "session.rolled_back",
      actor: options?.actor ?? "user",
      timestamp: new Date().toISOString(),
      payload: {
        fromSequence: previousSequenceNumber,
        toSequence: reconstructedState.targetSequenceNumber,
        targetEventId: reconstructedState.lastEventId,
        reason: options?.reason ?? "Point-in-time projection rollback",
        reconstructedSessionState: reconstructedState.sessionState,
      },
    });

    return {
      success: true,
      sessionId,
      targetSequenceNumber: reconstructedState.targetSequenceNumber,
      targetEventId: reconstructedState.lastEventId,
      previousSequenceNumber,
      discardedEventsCount,
      reconstructedState,
      compensationEventId: rolledBackEvent.id,
      durationMs: Date.now() - startTime,
    };
  }
}
