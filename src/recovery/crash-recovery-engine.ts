import type { SqliteEngine } from "../persistence/sqlite-engine.js";
import type { EventStore } from "../event-state/event-store.js";
import type { ProjectionManager } from "../event-state/projections/projection-manager.js";
import { LeaseManager } from "./lease-manager.js";
import { OrphanDetector } from "./orphan-detector.js";
import { CheckpointValidator } from "./checkpoint-validator.js";
import type { CheckpointRepository } from "../persistence/repositories/checkpoint-repository.js";
import type { ArtifactRepository } from "../persistence/repositories/artifact-repository.js";
import {
  RecoveryRecordSchema,
  type RecoveryAnomaly,
  type RecoveryRecord,
} from "./recovery-record.js";

export interface CrashRecoveryOptions {
  engine: SqliteEngine;
  eventStore?: EventStore;
  projectionManager?: ProjectionManager;
  leaseManager?: LeaseManager;
  checkpointRepo?: CheckpointRepository;
  artifactRepo?: ArtifactRepository;
}

export class CrashRecoveryEngine {
  private readonly engine: SqliteEngine;
  private readonly eventStore?: EventStore;
  private readonly projectionManager?: ProjectionManager;
  private readonly leaseManager: LeaseManager;
  private readonly orphanDetector: OrphanDetector;
  private readonly checkpointRepo?: CheckpointRepository;
  private readonly artifactRepo?: ArtifactRepository;

  constructor(options: CrashRecoveryOptions) {
    this.engine = options.engine;
    this.eventStore = options.eventStore;
    this.projectionManager = options.projectionManager;
    this.leaseManager = options.leaseManager ?? new LeaseManager();
    this.orphanDetector = new OrphanDetector(this.engine);
    this.checkpointRepo = options.checkpointRepo;
    this.artifactRepo = options.artifactRepo;
  }

  /**
   * Executes the full deterministic startup and crash recovery pipeline.
   * PRD Part 1 Section 47 & Engineering Playbook Rule 20.
   */
  public async executeRecovery(): Promise<RecoveryRecord> {
    const recoveryId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const startedAt = new Date().toISOString();
    const anomalies: RecoveryAnomaly[] = [];
    let status: "SUCCESS" | "WARNING" | "CRITICAL_ERROR" = "SUCCESS";

    // 1. SQLite Physical Integrity Check
    const integrityStmt = this.engine.raw.prepare("PRAGMA integrity_check;");
    const integrityRows = integrityStmt.all() as Array<{ integrity_check: string }>;
    const firstRow = integrityRows[0];
    const isIntegrityOk = Boolean(firstRow && firstRow.integrity_check === "ok");

    if (!isIntegrityOk) {
      status = "CRITICAL_ERROR";
      anomalies.push({
        type: "INTEGRITY_VIOLATION",
        entityId: "sqlite_database",
        description: `SQLite integrity check failed: ${JSON.stringify(integrityRows)}`,
        actionTaken: "FLAGGED",
        timestamp: new Date().toISOString(),
      });
    }

    // 2. Foreign Key Consistency Check
    const fkStmt = this.engine.raw.prepare("PRAGMA foreign_key_check;");
    const fkRows = fkStmt.all() as Array<{ table: string; rowid: number; parent: string }>;
    if (fkRows.length > 0) {
      status = status === "CRITICAL_ERROR" ? "CRITICAL_ERROR" : "WARNING";
      for (const fk of fkRows) {
        anomalies.push({
          type: "INTEGRITY_VIOLATION",
          entityId: `${fk.table}:${fk.rowid}`,
          description: `Foreign key violation in table '${fk.table}' referencing parent '${fk.parent}'`,
          actionTaken: "FLAGGED",
          timestamp: new Date().toISOString(),
        });
      }
    }

    // 3. Stale Lease Reclamation
    const leaseResult = this.leaseManager.reclaimStaleLeases();
    for (const evicted of leaseResult.evictedLeases) {
      anomalies.push({
        type: "STALE_LEASE",
        entityId: evicted.leaseId,
        description: `Evicted expired task lease for task '${evicted.taskId}' assigned to agent '${evicted.agentId}'`,
        actionTaken: "EVICTED",
        timestamp: new Date().toISOString(),
      });
    }

    // 4. Orphan Entity Detection
    const orphanReport = this.orphanDetector.detectOrphans();
    anomalies.push(...orphanReport.anomalies);
    if (orphanReport.totalOrphansCount > 0 && status === "SUCCESS") {
      status = "WARNING";
    }

    // 5. Checkpoint Verification (if checkpointRepo available)
    if (this.checkpointRepo) {
      const allCheckpointsStmt = this.engine.raw.prepare(
        "SELECT id, manifest_json, sha256, validation_checksum, type, project_id, session_id, created_at FROM checkpoints ORDER BY created_at DESC LIMIT 50;"
      );
      const rows = allCheckpointsStmt.all() as Array<{
        id: string;
        manifest_json: string;
        sha256: string;
        validation_checksum: string;
        type: string;
        project_id: string;
        session_id: string;
        created_at: string;
      }>;

      for (const row of rows) {
        const chk = {
          id: row.id,
          type: row.type as any,
          projectId: row.project_id,
          sessionId: row.session_id,
          manifest: JSON.parse(row.manifest_json),
          sha256: row.sha256,
          createdAt: row.created_at,
          validationChecksum: row.validation_checksum,
        };
        const validation = await CheckpointValidator.validateComplete(chk, {
          artifactRepo: this.artifactRepo,
        });
        if (!validation.isValid) {
          status = "CRITICAL_ERROR";
          anomalies.push({
            type: "CORRUPTED_CHECKPOINT",
            entityId: row.id,
            description: `Checkpoint '${row.id}' integrity validation failed: ${validation.errors.join("; ")}`,
            actionTaken: "FLAGGED",
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    // 6. Projections Rebuild & Sync (if projectionManager and eventStore provided)
    let projectionsRebuiltCount = 0;
    let eventsValidatedCount = 0;
    if (this.projectionManager && this.eventStore) {
      const eventCountStmt = this.engine.raw.prepare("SELECT COUNT(*) as count FROM events;");
      const eventCountRow = eventCountStmt.get() as { count: number } | undefined;
      eventsValidatedCount = eventCountRow?.count ?? 0;

      // Rebuild all projections from event log
      this.projectionManager.rebuildAll();
      projectionsRebuiltCount = 2; // SessionSummaryProjection and TaskBoardProjection
    }

    const completedAt = new Date().toISOString();

    const record: RecoveryRecord = {
      recoveryId,
      startedAt,
      completedAt,
      status,
      databaseIntegrityPassed: isIntegrityOk && fkRows.length === 0,
      eventsValidatedCount,
      projectionsRebuiltCount,
      staleLeasesEvictedCount: leaseResult.evictedCount,
      orphansDetectedCount: orphanReport.totalOrphansCount,
      anomalies,
      message:
        status === "SUCCESS"
          ? "Startup recovery completed cleanly with 0 integrity violations."
          : `Startup recovery completed with status ${status}. Found ${anomalies.length} anomalies.`,
    };

    return RecoveryRecordSchema.parse(record);
  }
}
