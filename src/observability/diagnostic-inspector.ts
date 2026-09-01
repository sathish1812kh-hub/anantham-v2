import { randomUUID } from "node:crypto";
import { type SqliteEngine } from "../persistence/sqlite-engine.js";
import { MigrationEngine } from "../persistence/migration-engine.js";
import { type TaskRepository } from "../persistence/repositories/task-repository.js";
import { type LeaseRepository } from "../persistence/repositories/lease-repository.js";
import { type JobRepository } from "../persistence/repositories/job-repository.js";
import {
  type DiagnosticReport,
  DiagnosticReportSchema,
} from "../domain/observability.js";

export interface DiagnosticInspectorOptions {
  engine: SqliteEngine;
  taskRepo?: TaskRepository;
  leaseRepo?: LeaseRepository;
  jobRepo?: JobRepository;
}

/**
 * Diagnostic Inspector & System Doctor.
 * PRD Part 2 Section 170.
 */
export class DiagnosticInspector {
  private readonly engine: SqliteEngine;
  private readonly taskRepo?: TaskRepository;
  private readonly leaseRepo?: LeaseRepository;
  private readonly jobRepo?: JobRepository;

  constructor(options: DiagnosticInspectorOptions) {
    this.engine = options.engine;
    this.taskRepo = options.taskRepo;
    this.leaseRepo = options.leaseRepo;
    this.jobRepo = options.jobRepo;
  }

  /**
   * Run full system diagnostic inspection.
   */
  public inspect(): DiagnosticReport {
    const checks: Record<string, boolean> = {};
    const anomalies: string[] = [];

    // 1. SQLite WAL & Database Integrity Check
    let sqliteIntegrity = false;
    try {
      const integrityRow = this.engine.raw.prepare("PRAGMA integrity_check;").get() as { integrity_check?: string } | undefined;
      sqliteIntegrity = integrityRow?.integrity_check === "ok";
      checks["sqlite_integrity"] = sqliteIntegrity;
      if (!sqliteIntegrity) {
        anomalies.push("SQLite integrity check failed.");
      }
    } catch (err: any) {
      checks["sqlite_integrity"] = false;
      anomalies.push(`SQLite integrity error: ${err.message}`);
    }

    // 2. Migration Version & Checksums
    let migrationsApplied = 0;
    try {
      const migrator = new MigrationEngine(this.engine);
      const applied = migrator.getAppliedMigrations();
      migrationsApplied = applied.length;
      checks["migrations_valid"] = migrationsApplied > 0;
    } catch (err: any) {
      checks["migrations_valid"] = false;
      anomalies.push(`Migration tracking error: ${err.message}`);
    }

    // 3. Active Leases Count
    let activeLeasesCount = 0;
    try {
      if (this.leaseRepo) {
        const leases = this.leaseRepo.listAllActive();
        activeLeasesCount = leases.length;
        checks["leases_scanned"] = true;
      }
    } catch {
      checks["leases_scanned"] = false;
    }

    // 4. Orphaned Tasks Count
    let orphanedTasksCount = 0;
    try {
      if (this.taskRepo) {
        const inProgress = this.taskRepo.listByStatus("running");
        // A running task without a valid active lease in leaseRepo is orphaned
        if (this.leaseRepo) {
          for (const t of inProgress) {
            const lease = this.leaseRepo.findActiveByTaskId(t.id);
            if (!lease) {
              orphanedTasksCount++;
            }
          }
        }

        checks["orphan_scan"] = true;
        if (orphanedTasksCount > 0) {
          anomalies.push(`${orphanedTasksCount} orphaned task(s) detected without active lease.`);
        }
      }
    } catch {
      checks["orphan_scan"] = false;
    }

    // 5. Crashed / Stalled Jobs Count
    let crashedJobsCount = 0;
    try {
      if (this.jobRepo) {
        const runningJobs = this.jobRepo.listJobsByStatus("RUNNING");
        crashedJobsCount = runningJobs.filter((j: any) => {
          // If last heartbeat older than 5 minutes
          const lastHeartbeat = new Date(j.updatedAt).getTime();
          return Date.now() - lastHeartbeat > 300000;
        }).length;
        checks["jobs_scanned"] = true;
        if (crashedJobsCount > 0) {
          anomalies.push(`${crashedJobsCount} background job(s) appear stalled or crashed.`);
        }
      }
    } catch {
      checks["jobs_scanned"] = false;
    }


    // Determine overall status
    let status: "HEALTHY" | "DEGRADED" | "UNHEALTHY" = "HEALTHY";
    if (!sqliteIntegrity) {
      status = "UNHEALTHY";
    } else if (anomalies.length > 0) {
      status = "DEGRADED";
    }

    return DiagnosticReportSchema.parse({
      reportId: `diag_${randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      status,
      sqliteIntegrity,
      migrationsApplied,
      activeLeasesCount,
      orphanedTasksCount,
      crashedJobsCount,
      unresolvedAnomalies: anomalies,
      checks,
    });
  }
}
