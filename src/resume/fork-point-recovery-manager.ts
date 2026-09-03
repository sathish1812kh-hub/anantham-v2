import { randomBytes } from "node:crypto";
import { SqliteEngine } from "../persistence/sqlite-engine.js";
import { SessionRepository } from "../persistence/repositories/session-repository.js";
import { TaskRepository } from "../persistence/repositories/task-repository.js";
import { EventStore } from "../event-state/event-store.js";
import type { EventRepository } from "../persistence/repositories/event-repository.js";
import type { CheckpointRepository } from "../persistence/repositories/checkpoint-repository.js";
import type { ArtifactRepository } from "../persistence/repositories/artifact-repository.js";
import type { DeltaSnapshotManager } from "../event-state/delta-snapshot-manager.js";
import type { ProjectionManager } from "../event-state/projections/projection-manager.js";
import { reconstructSessionState } from "../event-state/reconstruction/session-reconstruct.js";
import { reconstructTaskState } from "../event-state/reconstruction/task-reconstruct.js";
import { EventTypes, type HarnessEvent } from "../domain/event.js";
import type { Session } from "../domain/session.js";
import type { TaskStatus } from "../domain/task.js";

export interface ForkPointRecoveryRequest {
  sourceSessionId: string;
  forkAtEventId?: string;
  forkAtSequenceNumber?: number;
  forkAtTimestamp?: string;
  newSessionId?: string;
  newBranchName: string;
  newSessionName?: string;
  modelProfile?: string;
  keyPoolProfile?: string;
  reconcileTasks?: boolean;
  inheritMemory?: boolean;
  reason?: string;
}

export interface ForkPointPreview {
  sourceSessionId: string;
  forkAtEventId: string;
  forkAtTimestamp: string;
  sequenceNumber: number;
  totalAncestorEvents: number;
  sessionStateAtFork: {
    status: string;
    branch: string;
    activeTaskId?: string;
  };
  tasksAtFork: Array<{
    id: string;
    objective: string;
    status: string;
    reconciledStatus: string;
  }>;
  availableCheckpoints: string[];
}

export interface ForkPointRecoveryResult {
  success: boolean;
  recoveryId: string;
  sourceSessionId: string;
  forkedSessionId: string;
  forkedAtEventId: string;
  forkedAtTimestamp: string;
  parentBranch: string;
  newBranch: string;
  inheritedEventsCount: number;
  reconstructedTasksCount: number;
  reconciledTasks: Array<{ taskId: string; oldStatus: string; newStatus: string }>;
  parentSessionUntouched: boolean;
  newSession: Session;
  forkEvent: Readonly<HarnessEvent>;
  durationMs: number;
}

export interface ForkPointRecoveryManagerOptions {
  engine: SqliteEngine;
  sessionRepo: SessionRepository;
  taskRepo: TaskRepository;
  eventRepo: EventRepository;
  eventStore: EventStore;
  checkpointRepo?: CheckpointRepository;
  artifactRepo?: ArtifactRepository;
  deltaSnapshotManager?: DeltaSnapshotManager;
  projectionManager?: ProjectionManager;
}

export class ForkPointRecoveryManager {
  private readonly engine: SqliteEngine;
  private readonly sessionRepo: SessionRepository;
  private readonly taskRepo: TaskRepository;
  private readonly eventStore: EventStore;
  private readonly checkpointRepo?: CheckpointRepository;
  private readonly projectionManager?: ProjectionManager;
    
  constructor(options: ForkPointRecoveryManagerOptions) {
    this.engine = options.engine;
    this.sessionRepo = options.sessionRepo;
    this.taskRepo = options.taskRepo;
        this.eventStore = options.eventStore;
    this.checkpointRepo = options.checkpointRepo;
    this.projectionManager = options.projectionManager;
          }

  private resolveForkTarget(
    sourceSessionId: string,
    target: { eventId?: string; sequenceNumber?: number; timestamp?: string }
  ): { targetEvent: HarnessEvent; sequenceNumber: number; ancestorEvents: Readonly<HarnessEvent>[] } {
    const allEvents = this.eventStore.getEventsBySession(sourceSessionId);
    if (allEvents.length === 0) {
      throw new Error("Cannot fork from session with no events: " + sourceSessionId);
    }

    let targetSeq = allEvents.length;
    let initialEvent = allEvents[allEvents.length - 1];
    if (!initialEvent) {
      throw new Error("No events in session");
    }
    let targetEvent = initialEvent;

    if (target.eventId) {
      const idx = allEvents.findIndex((e) => e.id === target.eventId);
      if (idx === -1) {
        throw new Error("Fork target event ID not found in session: " + target.eventId);
      }
      targetSeq = idx + 1;
      const ev = allEvents[idx];
      if (ev) targetEvent = ev;
    } else if (typeof target.sequenceNumber === "number") {
      targetSeq = Math.max(1, Math.min(target.sequenceNumber, allEvents.length));
      const ev = allEvents[targetSeq - 1];
      if (ev) targetEvent = ev;
    } else if (target.timestamp) {
      const idx = allEvents.findIndex((e) => e.timestamp >= (target.timestamp as string));
      if (idx !== -1) {
        targetSeq = idx + 1;
        const ev = allEvents[idx];
        if (ev) targetEvent = ev;
      }
    }

    return {
      targetEvent,
      sequenceNumber: targetSeq,
      ancestorEvents: allEvents.slice(0, targetSeq) as Readonly<HarnessEvent>[],
    };
  }

  public validateForkSafety(sourceSessionId: string, forkAtEventId: string): { safe: boolean; errors: string[] } {
    const errors: string[] = [];
    const session = this.sessionRepo.findById(sourceSessionId);
    if (!session) {
      errors.push("Source session not found: " + sourceSessionId);
    }

    const event = this.eventStore.getEventById(forkAtEventId);
    if (!event) {
      errors.push("Target fork event not found: " + forkAtEventId);
    } else if (event.sessionId !== sourceSessionId) {
      errors.push("Target fork event does not belong to source session.");
    }

    return {
      safe: errors.length === 0,
      errors,
    };
  }

  public async previewForkPoint(
    sourceSessionId: string,
    target: { eventId?: string; sequenceNumber?: number; timestamp?: string }
  ): Promise<ForkPointPreview> {
    const { targetEvent, sequenceNumber, ancestorEvents } = this.resolveForkTarget(sourceSessionId, target);
    const sessionAgg = reconstructSessionState(sourceSessionId, ancestorEvents);

    const taskIds = new Set<string>();
    for (const ev of ancestorEvents) {
      if (ev.taskId) taskIds.add(ev.taskId);
    }

    const tasksAtFork: ForkPointPreview["tasksAtFork"] = [];
    for (const tid of taskIds) {
      const taskAgg = reconstructTaskState(tid, ancestorEvents);
      const rawStatus = taskAgg.status;
      const reconciledStatus = (rawStatus === "failed" || rawStatus === "running" || (rawStatus as string) === "claimed")
        ? "queued"
        : rawStatus;

      tasksAtFork.push({
        id: tid,
        objective: taskAgg.objective ?? "Task " + tid,
        status: rawStatus,
        reconciledStatus,
      });
    }

    const availableCheckpoints: string[] = [];
    if (this.checkpointRepo) {
      const chks = this.checkpointRepo.listBySession(sourceSessionId);
      for (const c of chks) {
        if (c.createdAt <= targetEvent.timestamp) {
          availableCheckpoints.push(c.id);
        }
      }
    }

    return {
      sourceSessionId,
      forkAtEventId: targetEvent.id,
      forkAtTimestamp: targetEvent.timestamp,
      sequenceNumber,
      totalAncestorEvents: sequenceNumber,
      sessionStateAtFork: {
        status: sessionAgg.status,
        branch: sessionAgg.branch ?? "main",
        activeTaskId: sessionAgg.activeTaskId,
      },
      tasksAtFork,
      availableCheckpoints,
    };
  }

  public async recoverFromForkPoint(request: ForkPointRecoveryRequest): Promise<ForkPointRecoveryResult> {
    const startTime = Date.now();
    const sourceSession = this.sessionRepo.findById(request.sourceSessionId);
    if (!sourceSession) {
      throw new Error("Source session not found: " + request.sourceSessionId);
    }

    const safety = this.validateForkSafety(
      request.sourceSessionId,
      (request.forkAtEventId ?? this.eventStore.getEventsBySession(request.sourceSessionId).slice(-1)[0]?.id) || ""
    );
    if (!safety.safe) {
      throw new Error("Cannot recover from fork point: " + safety.errors.join("; "));
    }

    const { targetEvent, sequenceNumber, ancestorEvents } = this.resolveForkTarget(request.sourceSessionId, {
      eventId: request.forkAtEventId,
      sequenceNumber: request.forkAtSequenceNumber,
      timestamp: request.forkAtTimestamp,
    });

    const newSessionId = request.newSessionId ?? "sess_" + Date.now() + "_" + randomBytes(4).toString("hex");
    const newSessionName = request.newSessionName ?? sourceSession.name + " (Recovered Fork)";
    const modelProfile = request.modelProfile ?? sourceSession.modelProfile;
    const keyPoolProfile = request.keyPoolProfile ?? sourceSession.keyPoolProfile;

    const parentSnapshot = { ...sourceSession };

    let createdSession: Session;
    let forkEvent: Readonly<HarnessEvent>;
    const reconciledTasks: Array<{ taskId: string; oldStatus: string; newStatus: string }> = [];
    const taskIds = new Set<string>();

    // Execute atomic transaction
    this.engine.transaction(() => {
      // 1. Create child session
      const newSessionObj = {
        id: newSessionId,
        projectId: sourceSession.projectId,
        name: newSessionName,
        branch: request.newBranchName || "main-fork",
        parentSessionId: sourceSession.id,
        status: "active" as const,
        modelProfile,
        keyPoolProfile,
        mode: sourceSession.mode,
        permissions: { ...sourceSession.permissions },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {
          forkedFromSessionId: sourceSession.id,
          forkedAtEventId: targetEvent.id,
          forkedAtTimestamp: targetEvent.timestamp,
          forkReason: request.reason ?? "Fork Point-in-Time Recovery",
        },
      };
      this.sessionRepo.save(newSessionObj);
      createdSession = newSessionObj;

      // 2. Reconstruct & clone tasks with status reconciliation
      for (const ev of ancestorEvents) {
        if (ev.taskId) taskIds.add(ev.taskId);
      }

      for (const tid of taskIds) {
        const taskAgg = reconstructTaskState(tid, ancestorEvents);
        const originalStatus = taskAgg.status as TaskStatus;
        let newStatus: TaskStatus = originalStatus;

        const shouldReconcile = request.reconcileTasks !== false;
        if (shouldReconcile && (originalStatus === "failed" || originalStatus === "running" || (originalStatus as string) === "claimed")) {
          newStatus = "queued";
          reconciledTasks.push({
            taskId: tid,
            oldStatus: originalStatus,
            newStatus,
          });
        }

        // Clone task to new session with new UUID
        const newTaskId = "tsk_" + Date.now() + "_" + randomBytes(3).toString("hex");
        const nowIso = new Date().toISOString();
        this.taskRepo.save({
          id: newTaskId,
          projectId: sourceSession.projectId,
          sessionId: newSessionId,
          objective: taskAgg.objective ?? "Task " + tid,
          status: newStatus,
          priority: taskAgg.priority ?? "normal",
          agentRole: taskAgg.assignedAgent,
          dependencies: [],
          inputArtifacts: [],
          outputArtifacts: [],
          createdAt: nowIso,
          updatedAt: nowIso,
          metadata: {
            clonedFromTaskId: tid,
            reconciledFromStatus: originalStatus,
          },
        });
      }

      // 3. Emit authoritative events to EventStore
      forkEvent = this.eventStore.append({
        id: "evt_fork_" + Date.now() + "_" + randomBytes(4).toString("hex"),
        schemaVersion: 1,
        projectId: sourceSession.projectId,
        sessionId: newSessionId,
        type: EventTypes.SESSION_FORKED,
        actor: "user",
        timestamp: new Date().toISOString(),
        payload: {
          parentSessionId: sourceSession.id,
          branch: request.newBranchName || "main-fork",
          forkedAtEventId: targetEvent.id,
          forkedAtTimestamp: targetEvent.timestamp,
          reason: request.reason ?? "Point-in-time session recovery",
        },
      });

      this.eventStore.append({
        id: "evt_rec_" + Date.now() + "_" + randomBytes(4).toString("hex"),
        schemaVersion: 1,
        projectId: sourceSession.projectId,
        sessionId: newSessionId,
        type: "session.fork_point_recovered",
        actor: "user",
        timestamp: new Date().toISOString(),
        payload: {
          sourceSessionId: sourceSession.id,
          forkedSessionId: newSessionId,
          inheritedEventsCount: sequenceNumber,
          reconciledTasksCount: reconciledTasks.length,
          reconciledTasks,
        },
      });
    });

    // Verify parent session remained untouched
    const parentAfter = this.sessionRepo.findById(sourceSession.id);
    const parentSessionUntouched = JSON.stringify(parentSnapshot) === JSON.stringify(parentAfter);

    // Rebuild projection manager if present
    if (this.projectionManager) {
      this.projectionManager.rebuildAll();
    }

    return {
      success: true,
      recoveryId: "rec_" + Date.now() + "_" + randomBytes(4).toString("hex"),
      sourceSessionId: sourceSession.id,
      forkedSessionId: newSessionId,
      forkedAtEventId: targetEvent.id,
      forkedAtTimestamp: targetEvent.timestamp,
      parentBranch: sourceSession.branch,
      newBranch: request.newBranchName,
      inheritedEventsCount: sequenceNumber,
      reconstructedTasksCount: taskIds.size,
      reconciledTasks,
      parentSessionUntouched,
      newSession: createdSession!,
      forkEvent: forkEvent!,
      durationMs: Date.now() - startTime,
    };
  }
}
