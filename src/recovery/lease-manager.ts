import { z } from "zod";
import type { TaskRepository } from "../persistence/repositories/task-repository.js";

export const TaskLeaseSchema = z.object({
  leaseId: z.string().min(1),
  taskId: z.string().min(1),
  agentId: z.string().min(1),
  acquiredAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
  lastHeartbeatAt: z.number().int().positive(),
  ttlMs: z.number().int().positive(),
  status: z.enum(["ACTIVE", "RELEASED", "EXPIRED", "REVOKED"]),
});
export type TaskLease = z.infer<typeof TaskLeaseSchema>;

export class LeaseManager {
  private readonly leases = new Map<string, TaskLease>(); // leaseId -> TaskLease
  private readonly taskToLease = new Map<string, string>(); // taskId -> leaseId
  private readonly taskRepo?: TaskRepository;
  private readonly defaultTtlMs: number;

  constructor(options?: { taskRepo?: TaskRepository; defaultTtlMs?: number }) {
    this.taskRepo = options?.taskRepo;
    this.defaultTtlMs = options?.defaultTtlMs ?? 30_000; // 30s default TTL
  }

  /**
   * Attempts to acquire an exclusive execution lease for a task.
   */
  public acquireLease(
    taskId: string,
    agentId: string,
    ttlMs: number = this.defaultTtlMs
  ): { success: boolean; lease?: TaskLease; reason?: string } {
    const now = Date.now();

    // Check if there is an existing lease for this task
    const existingLeaseId = this.taskToLease.get(taskId);
    if (existingLeaseId) {
      const existing = this.leases.get(existingLeaseId);
      if (existing && existing.status === "ACTIVE") {
        if (existing.expiresAt > now) {
          if (existing.agentId === agentId) {
            // Re-entrant renewal by same agent
            return this.heartbeat(existing.leaseId, ttlMs);
          }
          return {
            success: false,
            reason: `Task '${taskId}' is actively leased to agent '${existing.agentId}' until ${new Date(
              existing.expiresAt
            ).toISOString()}`,
          };
        } else {
          // Expired lease - revoke it
          existing.status = "EXPIRED";
        }
      }
    }

    const leaseId = `lease_${taskId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const lease: TaskLease = {
      leaseId,
      taskId,
      agentId,
      acquiredAt: now,
      expiresAt: now + ttlMs,
      lastHeartbeatAt: now,
      ttlMs,
      status: "ACTIVE",
    };

    this.leases.set(leaseId, lease);
    this.taskToLease.set(taskId, leaseId);

    return { success: true, lease };
  }

  /**
   * Heartbeat to extend an active lease.
   */
  public heartbeat(
    leaseId: string,
    extensionMs?: number
  ): { success: boolean; lease?: TaskLease; reason?: string } {
    const lease = this.leases.get(leaseId);
    if (!lease) {
      return { success: false, reason: `Lease '${leaseId}' not found.` };
    }

    if (lease.status !== "ACTIVE") {
      return { success: false, reason: `Lease '${leaseId}' is not active (status: ${lease.status}).` };
    }

    const now = Date.now();
    const ttl = extensionMs ?? lease.ttlMs;

    lease.lastHeartbeatAt = now;
    lease.expiresAt = now + ttl;

    return { success: true, lease };
  }

  /**
   * Explicitly releases a lease upon task completion, failure, or cancellation.
   */
  public releaseLease(leaseId: string): boolean {
    const lease = this.leases.get(leaseId);
    if (!lease) return false;

    lease.status = "RELEASED";
    if (this.taskToLease.get(lease.taskId) === leaseId) {
      this.taskToLease.delete(lease.taskId);
    }
    return true;
  }

  /**
   * Gets the active lease for a task if one exists and is unexpired.
   */
  public getActiveLease(taskId: string): TaskLease | null {
    const leaseId = this.taskToLease.get(taskId);
    if (!leaseId) return null;

    const lease = this.leases.get(leaseId);
    if (!lease || lease.status !== "ACTIVE") return null;

    if (lease.expiresAt <= Date.now()) {
      lease.status = "EXPIRED";
      this.taskToLease.delete(taskId);
      return null;
    }

    return lease;
  }

  /**
   * Scans and evicts all expired leases, resetting task states if taskRepo is provided.
   */
  public reclaimStaleLeases(): { evictedCount: number; evictedLeases: TaskLease[] } {
    const now = Date.now();
    const evictedLeases: TaskLease[] = [];

    for (const lease of this.leases.values()) {
      if (lease.status === "ACTIVE" && lease.expiresAt <= now) {
        lease.status = "EXPIRED";
        this.taskToLease.delete(lease.taskId);
        evictedLeases.push(lease);

        // If repository is connected and task is running/claimed, reset to queued for recovery
        if (this.taskRepo) {
          const task = this.taskRepo.findById(lease.taskId);
          if (task) {
            if (task.status === "running") {
              this.taskRepo.updateStatus(task.id, "blocked");
              this.taskRepo.updateStatus(task.id, "queued");
            } else if (task.status === "claimed") {
              this.taskRepo.updateStatus(task.id, "queued");
            }
          }
        }
      }
    }

    return {
      evictedCount: evictedLeases.length,
      evictedLeases,
    };
  }
}
