import { randomBytes } from "node:crypto";
import { z } from "zod";
import { SqliteEngine } from "../persistence/sqlite-engine.js";
import { TaskRepository } from "../persistence/repositories/task-repository.js";
import { EventStore } from "../event-state/event-store.js";
import { LeaseStatusSchema } from "../domain/lease.js";

export const ExternalLeaseKindSchema = z.enum([
  "MCP_SERVER",
  "REMOTE_EXECUTOR_NODE",
  "TOOL_LOCK",
  "SHARED_RESOURCE",
]);
export type ExternalLeaseKind = z.infer<typeof ExternalLeaseKindSchema>;

export const ExternalLeaseReconciliationStatusSchema = z.enum([
  "RENEWED_VALID",
  "RE_ACQUIRED_NEW_GENERATION",
  "REVOKED_UNREACHABLE",
  "EXPIRED_AND_RELEASED",
  "KEY_ROTATED_UPDATED",
]);
export type ExternalLeaseReconciliationStatus = z.infer<typeof ExternalLeaseReconciliationStatusSchema>;

export const ExternalServiceLeaseSchema = z.object({
  id: z.string().min(1),
  leaseKind: ExternalLeaseKindSchema,
  targetResourceId: z.string().min(1),
  sessionId: z.string().min(1),
  taskId: z.string().optional(),
  generation: z.number().int().positive().default(1),
  expiresAt: z.string(),
  lastHeartbeatAt: z.string(),
  ttlMs: z.number().int().positive().default(60_000),
  status: LeaseStatusSchema.default("ACTIVE"),
  credentialsRef: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type ExternalServiceLease = z.infer<typeof ExternalServiceLeaseSchema>;

export const ExternalLeaseReconciliationReportSchema = z.object({
  sessionId: z.string(),
  reconciledAt: z.string(),
  totalLeases: z.number().int().nonnegative(),
  renewedCount: z.number().int().nonnegative(),
  revokedCount: z.number().int().nonnegative(),
  keyRotatedCount: z.number().int().nonnegative(),
  reconciliations: z.array(
    z.object({
      leaseId: z.string(),
      targetResourceId: z.string(),
      leaseKind: ExternalLeaseKindSchema,
      status: ExternalLeaseReconciliationStatusSchema,
      previousGeneration: z.number(),
      newGeneration: z.number().optional(),
      explanation: z.string(),
    })
  ),
});
export type ExternalLeaseReconciliationReport = z.infer<typeof ExternalLeaseReconciliationReportSchema>;

export interface ExternalLeaseReconcilerOptions {
  engine?: SqliteEngine;
  taskRepo?: TaskRepository;
  eventStore?: EventStore;
  resourceProber?: (lease: ExternalServiceLease) => Promise<{ alive: boolean; renewable: boolean; error?: string }>;
  keyResolver?: (credentialsRef: string) => Promise<{ valid: boolean; rotatedKeyRef?: string }>;
}

export class ExternalLeaseReconciler {
  private readonly engine?: SqliteEngine;
  private readonly taskRepo?: TaskRepository;
  private readonly eventStore?: EventStore;
  private readonly resourceProber: (lease: ExternalServiceLease) => Promise<{ alive: boolean; renewable: boolean; error?: string }>;
    private inMemoryLeases: Map<string, ExternalServiceLease> = new Map();

  constructor(options: ExternalLeaseReconcilerOptions = {}) {
    this.engine = options.engine;
    this.taskRepo = options.taskRepo;
    this.eventStore = options.eventStore;
    this.resourceProber = options.resourceProber ?? (async () => ({ alive: true, renewable: true }));
      }

  public registerExternalLease(lease: ExternalServiceLease): void {
    const validated = ExternalServiceLeaseSchema.parse(lease);
    this.inMemoryLeases.set(validated.id, validated);

    if (this.engine) {
      try {
        const stmt = this.engine.raw.prepare(`
          INSERT INTO external_service_leases (
            id, lease_kind, target_resource_id, session_id, task_id,
            generation, expires_at, last_heartbeat_at, ttl_ms, status,
            credentials_ref, metadata_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            generation = excluded.generation,
            expires_at = excluded.expires_at,
            last_heartbeat_at = excluded.last_heartbeat_at,
            status = excluded.status,
            credentials_ref = excluded.credentials_ref,
            metadata_json = excluded.metadata_json;
        `);
        stmt.run(
          validated.id,
          validated.leaseKind,
          validated.targetResourceId,
          validated.sessionId,
          validated.taskId ?? null,
          validated.generation,
          validated.expiresAt,
          validated.lastHeartbeatAt,
          validated.ttlMs,
          validated.status,
          validated.credentialsRef ?? null,
          validated.metadata ? JSON.stringify(validated.metadata) : null
        );
      } catch {}
    }
  }

  public listLeases(sessionId?: string): ExternalServiceLease[] {
    if (this.engine) {
      try {
        let sql = "SELECT * FROM external_service_leases";
        const params: any[] = [];
        if (sessionId) {
          sql += " WHERE session_id = ?";
          params.push(sessionId);
        }
        const rows = this.engine.raw.prepare(sql).all(...params) as any[];
        if (rows.length > 0) {
          return rows.map((r) => ({
            id: r.id,
            leaseKind: r.lease_kind,
            targetResourceId: r.target_resource_id,
            sessionId: r.session_id,
            taskId: r.task_id ?? undefined,
            generation: Number(r.generation),
            expiresAt: r.expires_at,
            lastHeartbeatAt: r.last_heartbeat_at,
            ttlMs: Number(r.ttl_ms),
            status: r.status,
            credentialsRef: r.credentials_ref ?? undefined,
            metadata: r.metadata_json ? JSON.parse(r.metadata_json) : undefined,
          }));
        }
      } catch {}
    }

    const all = Array.from(this.inMemoryLeases.values());
    return sessionId ? all.filter((l) => l.sessionId === sessionId) : all;
  }

  public async reconcileSingleLease(
    lease: ExternalServiceLease,
    options?: { dryRun?: boolean }
  ): Promise<{ status: ExternalLeaseReconciliationStatus; newGeneration?: number; explanation: string }> {
    const probeResult = await this.resourceProber(lease);

    if (probeResult.alive && probeResult.renewable) {
      const newGeneration = lease.generation + 1;
      const newExpiresAt = new Date(Date.now() + lease.ttlMs).toISOString();

      if (!options?.dryRun) {
        lease.generation = newGeneration;
        lease.expiresAt = newExpiresAt;
        lease.lastHeartbeatAt = new Date().toISOString();
        lease.status = "ACTIVE";
        this.registerExternalLease(lease);

        if (this.eventStore) {
          this.eventStore.append({
            id: "evt_ext_ls_ren_" + Date.now(),
            schemaVersion: 1,
            sessionId: lease.sessionId,
            taskId: lease.taskId,
            type: "lease.renewed",
            actor: "system",
            timestamp: new Date().toISOString(),
            payload: {
              leaseId: lease.id,
              targetResourceId: lease.targetResourceId,
              newGeneration,
              expiresAt: newExpiresAt,
            },
          });
        }
      }

      return {
        status: "RENEWED_VALID",
        newGeneration,
        explanation: "External resource responded healthy. Renewed lease with incremented generation token.",
      };
    } else {
      // Unreachable or expired
      if (!options?.dryRun) {
        lease.status = "REVOKED";
        this.registerExternalLease(lease);

        // Transition dependent task to blocked if taskRepo is available
        if (lease.taskId && this.taskRepo) {
          try {
            const task = this.taskRepo.findById(lease.taskId);
            if (task && (task.status === "running" || task.status === "queued")) {
              this.taskRepo.save({
                ...task,
                status: "blocked",
                updatedAt: new Date().toISOString(),
                metadata: {
                  ...task.metadata,
                  blockedReason: "External resource lease unreachable: " + lease.targetResourceId,
                },
              });
            }
          } catch {}
        }

        if (this.eventStore) {
          this.eventStore.append({
            id: "evt_ext_ls_rev_" + Date.now(),
            schemaVersion: 1,
            sessionId: lease.sessionId,
            taskId: lease.taskId,
            type: "lease.revoked",
            actor: "system",
            timestamp: new Date().toISOString(),
            payload: {
              leaseId: lease.id,
              targetResourceId: lease.targetResourceId,
              error: probeResult.error ?? "Resource unreachable during resume",
            },
          });
        }
      }

      return {
        status: "REVOKED_UNREACHABLE",
        explanation: "External resource probe failed: " + (probeResult.error ?? "Endpoint unreachable"),
      };
    }
  }

  public async reconcileSessionLeases(
    sessionId: string,
    options?: { dryRun?: boolean; forceRevokeUnreachable?: boolean }
  ): Promise<ExternalLeaseReconciliationReport> {
    const leases = this.listLeases(sessionId);
    const reconciliations: ExternalLeaseReconciliationReport["reconciliations"] = [];
    let renewedCount = 0;
    let revokedCount = 0;

    for (const lease of leases) {
      const outcome = await this.reconcileSingleLease(lease, options);
      if (outcome.status === "RENEWED_VALID" || outcome.status === "RE_ACQUIRED_NEW_GENERATION") {
        renewedCount++;
      } else {
        revokedCount++;
      }

      reconciliations.push({
        leaseId: lease.id,
        targetResourceId: lease.targetResourceId,
        leaseKind: lease.leaseKind,
        status: outcome.status,
        previousGeneration: lease.generation,
        newGeneration: outcome.newGeneration,
        explanation: outcome.explanation,
      });
    }

    return {
      sessionId,
      reconciledAt: new Date().toISOString(),
      totalLeases: leases.length,
      renewedCount,
      revokedCount,
      keyRotatedCount: 0,
      reconciliations,
    };
  }

  public async handleKeyRotation(
    sessionId: string,
    oldKeyRef: string,
    newKeyRef: string
  ): Promise<{ updatedCount: number }> {
    const leases = this.listLeases(sessionId);
    let updatedCount = 0;

    for (const lease of leases) {
      if (lease.credentialsRef === oldKeyRef) {
        lease.credentialsRef = newKeyRef;
        this.registerExternalLease(lease);
        updatedCount++;

        if (this.eventStore) {
          this.eventStore.append({
            id: "evt_key_rot_" + Date.now() + "_" + randomBytes(3).toString("hex"),
            schemaVersion: 1,
            sessionId,
            taskId: lease.taskId,
            type: "key.rotated",
            actor: "system",
            timestamp: new Date().toISOString(),
            payload: {
              leaseId: lease.id,
              targetResourceId: lease.targetResourceId,
              oldKeyRef,
              newKeyRef,
            },
          });
        }
      }
    }

    return { updatedCount };
  }
}
