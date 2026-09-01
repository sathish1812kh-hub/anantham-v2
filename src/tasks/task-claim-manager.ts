import { randomUUID } from "node:crypto";
import {
  TaskClaimRequest,
  TaskClaimResult,
  TaskHeartbeatRequest,
  TaskHeartbeatResult,
  TaskLease,
  TaskLeaseSchema,
} from "../domain/lease.js";
import { EventTypes } from "../domain/event.js";
import { EventStore } from "../event-state/event-store.js";
import { SqliteEngine } from "../persistence/sqlite-engine.js";
import { TaskRepository } from "../persistence/repositories/task-repository.js";
import { LeaseRepository } from "../persistence/repositories/lease-repository.js";

export interface TaskClaimManagerOptions {
  engine: SqliteEngine;
  taskRepo: TaskRepository;
  leaseRepo: LeaseRepository;
  eventStore?: EventStore;
  defaultTtlMs?: number;
  defaultMaxRenewals?: number;
}

/**
 * Task Claim & Lease Manager orchestrating atomic claims, ownership fencing,
 * heartbeat renewals, and durable state transitions.
 * PRD Part 2 Section 35, Section 36.
 */
export class TaskClaimManager {
  private readonly engine: SqliteEngine;
  private readonly taskRepo: TaskRepository;
  private readonly leaseRepo: LeaseRepository;
  private readonly eventStore?: EventStore;
  private readonly defaultTtlMs: number;
  private readonly defaultMaxRenewals: number;

  constructor(options: TaskClaimManagerOptions) {
    this.engine = options.engine;
    this.taskRepo = options.taskRepo;
    this.leaseRepo = options.leaseRepo;
    this.eventStore = options.eventStore;
    this.defaultTtlMs = options.defaultTtlMs ?? 30000; // 30s default
    this.defaultMaxRenewals = options.defaultMaxRenewals ?? 100;
  }

  /**
   * Atomically claim a task with exclusive ownership lease and fencing token.
   * PRD Part 2 Section 35.
   */
  public claimTask(request: TaskClaimRequest): TaskClaimResult {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const ttlMs = request.ttlMs ?? this.defaultTtlMs;
    const maxRenewals = request.maxRenewals ?? this.defaultMaxRenewals;

    let claimResult: TaskClaimResult;

    try {
      claimResult = this.engine.transaction(() => {
        // 1. Fetch Task
        const task = this.taskRepo.findById(request.taskId);
        if (!task) {
          return {
            success: false,
            errorCode: "TASK_NOT_FOUND",
            errorMessage: `Task "${request.taskId}" not found`,
          };
        }

        // 2. Project Isolation Check
        if (task.projectId !== request.projectId) {
          return {
            success: false,
            errorCode: "PROJECT_ISOLATION_VIOLATION",
            errorMessage: `Task "${request.taskId}" belongs to project "${task.projectId}", not "${request.projectId}"`,
          };
        }

        // 3. Claimable Status Check
        if (task.status !== "queued" && task.status !== "available") {
          return {
            success: false,
            errorCode: "TASK_NOT_CLAIMABLE",
            errorMessage: `Task "${request.taskId}" is in state "${task.status}" and cannot be claimed`,
          };
        }

        // 4. Dependency Satisfaction Check
        if (task.dependencies.length > 0) {
          for (const depId of task.dependencies) {
            const depTask = this.taskRepo.findById(depId);
            if (!depTask || depTask.status !== "completed") {
              return {
                success: false,
                errorCode: "DEPENDENCIES_NOT_SATISFIED",
                errorMessage: `Task dependency "${depId}" is not completed`,
              };
            }
          }
        }

        // 5. Active Lease & Concurrency Conflict Check
        const activeLease = this.leaseRepo.findActiveByTaskId(request.taskId);
        if (activeLease) {
          const leaseExpTime = new Date(activeLease.expiresAt).getTime();
          if (now < leaseExpTime) {
            // Actively owned and unexpired
            return {
              success: false,
              errorCode: "CLAIM_CONFLICT",
              errorMessage: `Task "${request.taskId}" is already actively leased to agent "${activeLease.agentId}" until ${activeLease.expiresAt}`,
            };
          } else {
            // Stale expired lease -> expire it
            this.leaseRepo.updateStatus(activeLease.id, "EXPIRED");
          }
        }

        // 6. Monotonic Fencing Token (Generation) calculation
        const latestLease = this.leaseRepo.findLatestByTaskId(request.taskId);
        const prevGeneration = latestLease ? latestLease.generation : 0;
        const generation = prevGeneration + 1;

        // 7. Create Durable Lease Record
        const leaseId = `lease_${randomUUID()}`;
        const expiresAtIso = new Date(now + ttlMs).toISOString();

        const lease: TaskLease = {
          id: leaseId,
          taskId: request.taskId,
          agentId: request.agentId,
          instanceId: request.instanceId,
          projectId: request.projectId,
          sessionId: request.sessionId,
          generation,
          acquiredAt: nowIso,
          expiresAt: expiresAtIso,
          lastHeartbeatAt: nowIso,
          ttlMs,
          status: "ACTIVE",
          renewalCount: 0,
          maxRenewals,
          metadata: {
            claimedByRole: request.startupPlan?.role,
            modelId: request.startupPlan?.resolvedModel.modelId,
          },
        };

        TaskLeaseSchema.parse(lease);
        this.leaseRepo.save(lease);

        // 8. Update Task Status -> claimed
        this.taskRepo.updateStatus(task.id, "claimed");

        // 9. Emit durable audit events within the SAME authoritative transaction
        const committedEvents: any[] = [];
        const ev1 = this.createAndAppendEventInTx(EventTypes.TASK_CLAIMED, {
          taskId: request.taskId,
          agentId: request.agentId,
          instanceId: request.instanceId,
          leaseId: lease.id,
          generation: lease.generation,
          projectId: request.projectId,
          sessionId: request.sessionId,
          expiresAt: lease.expiresAt,
        });
        if (ev1) committedEvents.push(ev1);

        const ev2 = this.createAndAppendEventInTx(EventTypes.TASK_LEASE_ACQUIRED, {
          leaseId: lease.id,
          taskId: request.taskId,
          agentId: request.agentId,
          instanceId: request.instanceId,
          generation: lease.generation,
          projectId: request.projectId,
          sessionId: request.sessionId,
          ttlMs,
        });
        if (ev2) committedEvents.push(ev2);

        return {
          success: true,
          lease,
          committedEvents,
        };
      });

      if (claimResult.success && (claimResult as any).committedEvents) {
        this.eventStore?.notifyCommitted((claimResult as any).committedEvents);
      }
    } catch (err: any) {
      return {
        success: false,
        errorCode: "TRANSACTION_ERROR",
        errorMessage: err.message,
      };
    }

    return claimResult;
  }

  /**
   * Heartbeat to extend active lease validity with fencing token validation.
   * PRD Part 2 Section 36.
   */
  public heartbeat(request: TaskHeartbeatRequest): TaskHeartbeatResult {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    let heartbeatResult: TaskHeartbeatResult;

    try {
      heartbeatResult = this.engine.transaction(() => {
        const lease = this.leaseRepo.findById(request.leaseId);
        if (!lease) {
          return {
            success: false,
            errorCode: "LEASE_NOT_FOUND",
            errorMessage: `Lease "${request.leaseId}" not found`,
          };
        }

        if (lease.status !== "ACTIVE") {
          return {
            success: false,
            errorCode: "LEASE_NOT_ACTIVE",
            errorMessage: `Lease "${request.leaseId}" is not active (status: ${lease.status})`,
          };
        }

        // Ownership mismatch check
        if (
          lease.agentId !== request.agentId ||
          lease.instanceId !== request.instanceId
        ) {
          return {
            success: false,
            errorCode: "OWNERSHIP_MISMATCH",
            errorMessage: `Lease "${request.leaseId}" is assigned to agent "${lease.agentId}" (instance: ${lease.instanceId}), not caller "${request.agentId}" (instance: ${request.instanceId})`,
          };
        }

        // Fencing Token Check
        if (lease.generation !== request.generation) {
          return {
            success: false,
            errorCode: "FENCING_VIOLATION",
            errorMessage: `Stale generation token "${request.generation}". Current lease generation is "${lease.generation}"`,
          };
        }

        // Expiration check
        const expTime = new Date(lease.expiresAt).getTime();
        if (now >= expTime) {
          this.leaseRepo.updateStatus(lease.id, "EXPIRED");
          this.taskRepo.updateStatus(lease.taskId, "queued");
          const ev = this.createAndAppendEventInTx(EventTypes.TASK_RELEASED, {
            leaseId: lease.id,
            taskId: lease.taskId,
            agentId: lease.agentId,
            instanceId: lease.instanceId,
            projectId: lease.projectId,
            sessionId: lease.sessionId,
            reason: "HEARTBEAT_LEASE_EXPIRED",
          });
          return {
            success: false,
            errorCode: "LEASE_EXPIRED",
            errorMessage: `Lease "${request.leaseId}" expired at ${lease.expiresAt}`,
            committedEvents: ev ? [ev] : [],
          };
        }

        // Renewal Count Limit check
        if (lease.renewalCount >= lease.maxRenewals) {
          return {
            success: false,
            errorCode: "MAX_RENEWALS_EXCEEDED",
            errorMessage: `Lease "${request.leaseId}" reached maximum renewals limit of ${lease.maxRenewals}`,
          };
        }

        // Extend lease
        const extensionMs = request.extensionMs ?? lease.ttlMs;
        lease.lastHeartbeatAt = nowIso;
        lease.expiresAt = new Date(now + extensionMs).toISOString();
        lease.renewalCount += 1;

        if (request.currentAction || request.lastTool || request.lastModelRequest) {
          lease.metadata = {
            ...lease.metadata,
            currentAction: request.currentAction,
            lastTool: request.lastTool,
            lastModelRequest: request.lastModelRequest,
          };
        }

        this.leaseRepo.save(lease);

        // Atomic audit event within transaction
        const ev = this.createAndAppendEventInTx(EventTypes.TASK_HEARTBEAT, {
          leaseId: lease.id,
          taskId: lease.taskId,
          agentId: lease.agentId,
          instanceId: lease.instanceId,
          projectId: lease.projectId,
          sessionId: lease.sessionId,
          generation: lease.generation,
          renewalCount: lease.renewalCount,
          expiresAt: lease.expiresAt,
          currentAction: request.currentAction,
          lastTool: request.lastTool,
          lastModelRequest: request.lastModelRequest,
        });

        return {
          success: true,
          lease,
          committedEvents: ev ? [ev] : [],
        };
      });

      if (heartbeatResult.success && (heartbeatResult as any).committedEvents) {
        this.eventStore?.notifyCommitted((heartbeatResult as any).committedEvents);
      }
    } catch (err: any) {
      return {
        success: false,
        errorCode: "TRANSACTION_ERROR",
        errorMessage: err.message,
      };
    }

    return heartbeatResult;
  }

  /**
   * Verify whether caller possesses active ownership with valid generation token.
   * Playbook Section 52.
   */
  public verifyOwnership(
    taskId: string,
    leaseId: string,
    generation: number,
    agentId?: string
  ): boolean {
    const activeLease = this.leaseRepo.findActiveByTaskId(taskId);
    if (!activeLease) return false;

    if (
      activeLease.id === leaseId &&
      activeLease.generation === generation &&
      activeLease.status === "ACTIVE"
    ) {
      if (agentId && activeLease.agentId !== agentId) {
        return false;
      }
      return Date.now() < new Date(activeLease.expiresAt).getTime();
    }
    return false;
  }

  /**
   * Complete task and release exclusive lease.
   */
  public completeTask(
    taskIdOrParams:
      | string
      | {
          taskId: string;
          leaseId: string;
          generation: number;
          resultMetadata?: Record<string, unknown>;
          agentId?: string;
        },
    leaseId?: string,
    generation?: number,
    resultMetadata?: Record<string, unknown>,
    agentId?: string
  ): boolean {
    let tId: string;
    let lId: string;
    let gen: number;
    let resMeta: Record<string, unknown> | undefined;
    let aId: string | undefined;

    if (typeof taskIdOrParams === "object") {
      tId = taskIdOrParams.taskId;
      lId = taskIdOrParams.leaseId;
      gen = taskIdOrParams.generation;
      resMeta = taskIdOrParams.resultMetadata;
      aId = taskIdOrParams.agentId;
    } else {
      tId = taskIdOrParams;
      lId = leaseId!;
      gen = generation!;
      resMeta = resultMetadata;
      aId = agentId;
    }

    const committedEvents: any[] = [];
    const success = this.engine.transaction(() => {
      if (!this.verifyOwnership(tId, lId, gen, aId)) {
        return false;
      }

      this.taskRepo.updateStatus(tId, "completed");
      this.leaseRepo.updateStatus(lId, "RELEASED");
      const lease = this.leaseRepo.findById(lId);

      const ev1 = this.createAndAppendEventInTx(EventTypes.TASK_COMPLETED, {
        taskId: tId,
        leaseId: lId,
        generation: gen,
        agentId: lease?.agentId,
        projectId: lease?.projectId,
        sessionId: lease?.sessionId,
        result: resMeta,
      });
      if (ev1) committedEvents.push(ev1);

      const ev2 = this.createAndAppendEventInTx(EventTypes.TASK_RELEASED, {
        taskId: tId,
        leaseId: lId,
        agentId: lease?.agentId,
        projectId: lease?.projectId,
        sessionId: lease?.sessionId,
        reason: "COMPLETED",
      });
      if (ev2) committedEvents.push(ev2);

      return true;
    });

    if (!success) {
      return false;
    }

    if (this.eventStore && committedEvents.length > 0) {
      this.eventStore.notifyCommitted(committedEvents);
    }

    return true;
  }

  /**
   * Fail task and release lease.
   */
  public failTask(
    taskIdOrParams:
      | string
      | {
          taskId: string;
          leaseId: string;
          generation: number;
          error: string;
          agentId?: string;
        },
    leaseId?: string,
    generation?: number,
    error?: string,
    agentId?: string
  ): boolean {
    let tId: string;
    let lId: string;
    let gen: number;
    let errStr: string;
    let aId: string | undefined;

    if (typeof taskIdOrParams === "object") {
      tId = taskIdOrParams.taskId;
      lId = taskIdOrParams.leaseId;
      gen = taskIdOrParams.generation;
      errStr = taskIdOrParams.error;
      aId = taskIdOrParams.agentId;
    } else {
      tId = taskIdOrParams;
      lId = leaseId!;
      gen = generation!;
      errStr = error!;
      aId = agentId;
    }

    const committedEvents: any[] = [];
    const success = this.engine.transaction(() => {
      if (!this.verifyOwnership(tId, lId, gen, aId)) {
        return false;
      }

      this.taskRepo.updateStatus(tId, "failed");
      this.leaseRepo.updateStatus(lId, "RELEASED");
      const lease = this.leaseRepo.findById(lId);

      const ev1 = this.createAndAppendEventInTx(EventTypes.TASK_FAILED, {
        taskId: tId,
        leaseId: lId,
        generation: gen,
        agentId: lease?.agentId,
        projectId: lease?.projectId,
        sessionId: lease?.sessionId,
        error: errStr,
      });
      if (ev1) committedEvents.push(ev1);

      const ev2 = this.createAndAppendEventInTx(EventTypes.TASK_RELEASED, {
        taskId: tId,
        leaseId: lId,
        agentId: lease?.agentId,
        projectId: lease?.projectId,
        sessionId: lease?.sessionId,
        reason: "FAILED",
      });
      if (ev2) committedEvents.push(ev2);

      return true;
    });

    if (!success) {
      return false;
    }

    if (this.eventStore && committedEvents.length > 0) {
      this.eventStore.notifyCommitted(committedEvents);
    }

    return true;
  }

  /**
   * Voluntarily release an active lease and return task to queued.
   */
  public releaseTask(
    taskIdOrParams:
      | string
      | {
          taskId: string;
          leaseId: string;
          generation: number;
          reason?: string;
          agentId?: string;
        },
    leaseId?: string,
    generation?: number,
    reason: string = "VOLUNTARY_RELEASE",
    agentId?: string
  ): boolean {
    let tId: string;
    let lId: string;
    let gen: number;
    let releaseReason: string;
    let aId: string | undefined;

    if (typeof taskIdOrParams === "object") {
      tId = taskIdOrParams.taskId;
      lId = taskIdOrParams.leaseId;
      gen = taskIdOrParams.generation;
      releaseReason = taskIdOrParams.reason ?? "VOLUNTARY_RELEASE";
      aId = taskIdOrParams.agentId;
    } else {
      tId = taskIdOrParams;
      lId = leaseId!;
      gen = generation!;
      releaseReason = reason;
      aId = agentId;
    }

    const committedEvents: any[] = [];
    const success = this.engine.transaction(() => {
      if (!this.verifyOwnership(tId, lId, gen, aId)) {
        return false;
      }

      this.taskRepo.updateStatus(tId, "queued");
      this.leaseRepo.updateStatus(lId, "RELEASED");
      const lease = this.leaseRepo.findById(lId);

      const ev = this.createAndAppendEventInTx(EventTypes.TASK_RELEASED, {
        taskId: tId,
        leaseId: lId,
        agentId: lease?.agentId,
        projectId: lease?.projectId,
        sessionId: lease?.sessionId,
        reason: releaseReason,
      });
      if (ev) committedEvents.push(ev);

      return true;
    });

    if (!success) {
      return false;
    }

    if (this.eventStore && committedEvents.length > 0) {
      this.eventStore.notifyCommitted(committedEvents);
    }

    return true;
  }

  /**
   * Creates and appends an event to the EventStore inside the current transaction.
   */
  private createAndAppendEventInTx(
    type: string,
    payload: Record<string, unknown>
  ): any {
    if (!this.eventStore) return null;
    const event = {
      id: `evt_${randomUUID()}`,
      schemaVersion: 1,
      type,
      actor: "system" as const,
      projectId: (payload.projectId as string) || "system",
      sessionId: payload.sessionId ? (payload.sessionId as string) : undefined,
      taskId: payload.taskId ? (payload.taskId as string) : undefined,
      agentId: payload.agentId ? (payload.agentId as string) : undefined,
      payload,
      timestamp: new Date().toISOString(),
    };
    return this.eventStore.appendWithinTransaction(event);

  }
}

