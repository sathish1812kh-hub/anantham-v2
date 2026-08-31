import { randomUUID } from "node:crypto";
import {
  StalledClassification,
  TaskLease,
  TaskRecoveryAction,
  TaskRecoveryRecord,
  TaskRecoveryRecordSchema,
} from "../domain/lease.js";
import { EventTypes } from "../domain/event.js";
import { EventStore } from "../event-state/event-store.js";
import { SqliteEngine } from "../persistence/sqlite-engine.js";
import { TaskRepository } from "../persistence/repositories/task-repository.js";
import { LeaseRepository } from "../persistence/repositories/lease-repository.js";
import { AgentManager } from "../agents/agent-manager.js";

export interface StalledAgentRecoveryOptions {
  engine: SqliteEngine;
  taskRepo: TaskRepository;
  leaseRepo: LeaseRepository;
  agentManager?: AgentManager;
  eventStore?: EventStore;
  defaultMaxAttempts?: number;
}

/**
 * Stalled Agent Detection & Task Recovery Engine.
 * PRD Part 2 Section 37, Engineering Playbook Section 54.
 */
export class StalledAgentRecoveryEngine {
  private readonly engine: SqliteEngine;
  private readonly taskRepo: TaskRepository;
  private readonly leaseRepo: LeaseRepository;
  private readonly agentManager?: AgentManager;
  private readonly eventStore?: EventStore;
  private readonly defaultMaxAttempts: number;

  constructor(options: StalledAgentRecoveryOptions) {
    this.engine = options.engine;
    this.taskRepo = options.taskRepo;
    this.leaseRepo = options.leaseRepo;
    this.agentManager = options.agentManager;
    this.eventStore = options.eventStore;
    this.defaultMaxAttempts = options.defaultMaxAttempts ?? 3;
  }

  /**
   * Scan for active leases that have exceeded expiresAt.
   */
  public detectStalledLeases(nowIso?: string): TaskLease[] {
    const checkTime = nowIso ?? new Date().toISOString();
    return this.leaseRepo.listExpiredActive(checkTime);
  }

  /**
   * Classify root cause of lease stall.
   */
  public classifyStall(lease: TaskLease): StalledClassification {
    if (this.agentManager) {
      const instance = this.agentManager.getInstance(lease.instanceId);
      if (!instance || instance.status === "stopped" || instance.status === "failed") {
        return "AGENT_CRASHED";
      }
    }

    if (lease.renewalCount >= lease.maxRenewals) {
      return "MAX_DURATION_EXCEEDED";
    }

    return "HEARTBEAT_TIMEOUT";
  }

  /**
   * Execute deterministic stalled lease recovery pipeline.
   * PRD Part 2 Section 37.
   */
  public recoverStalledLeases(options?: {
    nowIso?: string;
    maxAttempts?: number;
  }): TaskRecoveryRecord[] {
    const nowIso = options?.nowIso ?? new Date().toISOString();
    const maxAttempts = options?.maxAttempts ?? this.defaultMaxAttempts;

    const stalledLeases = this.detectStalledLeases(nowIso);
    const records: TaskRecoveryRecord[] = [];

    for (const lease of stalledLeases) {
      const classification = this.classifyStall(lease);
      let action: TaskRecoveryAction = "RECLAIM_AND_REQUEUE";
      let attemptCount = 1;
      let newGeneration = lease.generation + 1;

      this.engine.transaction(() => {
        const task = this.taskRepo.findById(lease.taskId);
        if (!task) return;

        attemptCount = ((task.metadata?.attemptCount as number) ?? 1);

        if (attemptCount < maxAttempts) {
          // Reclaim and requeue task
          action = "RECLAIM_AND_REQUEUE";
          this.leaseRepo.updateStatus(lease.id, "EXPIRED");

          task.metadata = {
            ...task.metadata,
            attemptCount: attemptCount + 1,
            lastReclaimedAt: nowIso,
            lastStallReason: classification,
          };
          task.status = "queued";
          task.updatedAt = nowIso;
          this.taskRepo.save(task);
        } else {
          // Bounded retries exhausted -> Fail task
          action = "FAIL";
          this.leaseRepo.updateStatus(lease.id, "REVOKED");

          task.metadata = {
            ...task.metadata,
            failureReason: "STALLED_AGENT_MAX_RETRIES_EXCEEDED",
            lastStallReason: classification,
          };
          task.status = "failed";
          task.updatedAt = nowIso;
          this.taskRepo.save(task);
        }
      });

      const recoveryRecord: TaskRecoveryRecord = {
        taskId: lease.taskId,
        leaseId: lease.id,
        agentId: lease.agentId,
        classification,
        action,
        attemptCount,
        maxAttempts,
        newGeneration: action === "RECLAIM_AND_REQUEUE" ? newGeneration : undefined,
        timestamp: nowIso,
        reason:
          action === "RECLAIM_AND_REQUEUE"
            ? `Stalled lease expired (${classification}). Reclaimed for attempt ${attemptCount + 1}/${maxAttempts}`
            : `Stalled lease expired (${classification}). Max attempts (${maxAttempts}) exceeded; marked failed`,
      };

      TaskRecoveryRecordSchema.parse(recoveryRecord);
      records.push(recoveryRecord);

      // Emit durable audit events
      this.emitEvent(EventTypes.TASK_LEASE_EXPIRED, {
        leaseId: lease.id,
        taskId: lease.taskId,
        agentId: lease.agentId,
        generation: lease.generation,
        classification,
        projectId: lease.projectId,
        sessionId: lease.sessionId,
      });

      if (action === "RECLAIM_AND_REQUEUE") {
        this.emitEvent(EventTypes.TASK_RECLAIMED, {
          taskId: lease.taskId,
          leaseId: lease.id,
          previousAgentId: lease.agentId,
          newGeneration,
          attemptCount: attemptCount + 1,
          maxAttempts,
          projectId: lease.projectId,
          sessionId: lease.sessionId,
        });
      } else {
        this.emitEvent(EventTypes.TASK_FAILED, {
          taskId: lease.taskId,
          leaseId: lease.id,
          agentId: lease.agentId,
          error: "STALLED_AGENT_MAX_RETRIES_EXCEEDED",
          projectId: lease.projectId,
          sessionId: lease.sessionId,
        });
      }
    }

    return records;
  }

  /**
   * Emit audit event to EventStore.
   */
  private emitEvent(type: string, payload: Record<string, unknown>): void {
    if (!this.eventStore) return;
    try {
      this.eventStore.append({
        id: `evt_${randomUUID()}`,
        schemaVersion: 1,
        type,
        actor: "system",
        projectId: (payload.projectId as string) || "system",
        sessionId: payload.sessionId ? (payload.sessionId as string) : undefined,
        taskId: payload.taskId ? (payload.taskId as string) : undefined,
        agentId: payload.agentId ? (payload.agentId as string) : undefined,
        payload,
        timestamp: new Date().toISOString(),
      });
    } catch {
      // EventStore logging must not crash primary transaction
    }
  }
}
