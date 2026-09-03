import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { SqliteEngine } from "../persistence/sqlite-engine.js";
import { TaskRepository } from "../persistence/repositories/task-repository.js";
import { EventStore } from "../event-state/event-store.js";

export const ProcessReconnectStatusSchema = z.enum([
  "REATTACHED_RUNNING",
  "HARVESTED_COMPLETED",
  "HARVESTED_FAILED",
  "ORPHAN_TERMINATED",
  "ORPHAN_SAFE_RETRY",
  "ORPHAN_BLOCKED_UNSAFE_SIDE_EFFECT",
  "PID_RECYCLED_MISMATCH",
]);
export type ProcessReconnectStatus = z.infer<typeof ProcessReconnectStatusSchema>;

export const DetachedProcessRecordSchema = z.object({
  executionId: z.string().min(1),
  taskId: z.string().min(1),
  sessionId: z.string().min(1),
  projectId: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  cwd: z.string().min(1),
  pid: z.number().int().positive(),
  processStartTime: z.number().int().positive(),
  stdoutLogPath: z.string().min(1),
  stderrLogPath: z.string().min(1),
  exitCodePath: z.string().optional(),
  sideEffectSafety: z.enum(["IDEMPOTENT", "NON_IDEMPOTENT", "READ_ONLY"]),
  leaseId: z.string().optional(),
  lastHeartbeatAt: z.number().int().positive(),
  status: z.enum(["running", "completed", "failed", "lost"]).default("running"),
});
export type DetachedProcessRecord = z.infer<typeof DetachedProcessRecordSchema>;

export const ProcessReconciliationReportSchema = z.object({
  sessionId: z.string(),
  totalInspected: z.number().int().nonnegative(),
  reattachedCount: z.number().int().nonnegative(),
  harvestedCount: z.number().int().nonnegative(),
  orphanedCount: z.number().int().nonnegative(),
  details: z.array(
    z.object({
      executionId: z.string(),
      taskId: z.string(),
      pid: z.number(),
      outcome: ProcessReconnectStatusSchema,
      exitCode: z.number().optional(),
      explanation: z.string(),
    })
  ),
  timestamp: z.string(),
});
export type ProcessReconciliationReport = z.infer<typeof ProcessReconciliationReportSchema>;

export interface ProcessReconnectManagerOptions {
  engine?: SqliteEngine;
  taskRepo: TaskRepository;
  eventStore: EventStore;
  processInspector?: (pid: number) => Promise<{ alive: boolean; startTime?: number; command?: string }>;
}

export class ProcessReconnectManager {
  private readonly engine?: SqliteEngine;
  private readonly taskRepo: TaskRepository;
  private readonly eventStore: EventStore;
  private readonly processInspector: (pid: number) => Promise<{ alive: boolean; startTime?: number; command?: string }>;
  private readonly detachedRecords: Map<string, DetachedProcessRecord> = new Map();

  constructor(options: ProcessReconnectManagerOptions) {
    this.engine = options.engine;
    this.taskRepo = options.taskRepo;
    this.eventStore = options.eventStore;
    this.processInspector = options.processInspector ?? (async (pid) => {
      try {
        // Signal 0 checks if PID is currently alive without terminating it
        process.kill(pid, 0);
        return { alive: true };
      } catch {
        return { alive: false };
      }
    });
  }

  public registerDetachedProcess(record: DetachedProcessRecord): void {
    const validated = DetachedProcessRecordSchema.parse(record);
    this.detachedRecords.set(validated.executionId, validated);

    if (this.engine) {
      try {
        const stmt = this.engine.raw.prepare(`
          INSERT INTO detached_processes (
            execution_id, task_id, session_id, project_id,
            command, args_json, cwd, pid, process_start_time,
            stdout_log_path, stderr_log_path, exit_code_path,
            side_effect_safety, lease_id, last_heartbeat_at, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(execution_id) DO UPDATE SET
            last_heartbeat_at = excluded.last_heartbeat_at,
            status = excluded.status;
        `);
        stmt.run(
          validated.executionId,
          validated.taskId,
          validated.sessionId,
          validated.projectId,
          validated.command,
          JSON.stringify(validated.args),
          validated.cwd,
          validated.pid,
          validated.processStartTime,
          validated.stdoutLogPath,
          validated.stderrLogPath,
          validated.exitCodePath ?? null,
          validated.sideEffectSafety,
          validated.leaseId ?? null,
          validated.lastHeartbeatAt,
          validated.status
        );
      } catch {}
    }
  }

  public listDetachedProcesses(sessionId?: string): DetachedProcessRecord[] {
    if (this.engine) {
      try {
        let sql = "SELECT * FROM detached_processes";
        const params: any[] = [];
        if (sessionId) {
          sql += " WHERE session_id = ?";
          params.push(sessionId);
        }
        const rows = this.engine.raw.prepare(sql).all(...params) as any[];
        if (rows.length > 0) {
          return rows.map((r) => ({
            executionId: r.execution_id,
            taskId: r.task_id,
            sessionId: r.session_id,
            projectId: r.project_id,
            command: r.command,
            args: JSON.parse(r.args_json || "[]"),
            cwd: r.cwd,
            pid: Number(r.pid),
            processStartTime: Number(r.process_start_time),
            stdoutLogPath: r.stdout_log_path,
            stderrLogPath: r.stderr_log_path,
            exitCodePath: r.exit_code_path ?? undefined,
            sideEffectSafety: r.side_effect_safety,
            leaseId: r.lease_id ?? undefined,
            lastHeartbeatAt: Number(r.last_heartbeat_at),
            status: r.status,
          }));
        }
      } catch {}
    }

    const all = Array.from(this.detachedRecords.values());
    return sessionId ? all.filter((r) => r.sessionId === sessionId) : all;
  }

  public async verifyProcessIdentity(record: DetachedProcessRecord): Promise<boolean> {
    const inspection = await this.processInspector(record.pid);
    if (!inspection.alive) {
      return false;
    }
    // If start time is available from OS, verify match to prevent PID recycling false-positives
    if (inspection.startTime !== undefined && Math.abs(inspection.startTime - record.processStartTime) > 1000) {
      return false;
    }
    return true;
  }

  public async handleOrphanProcess(
    record: DetachedProcessRecord,
    options?: { dryRun?: boolean }
  ): Promise<ProcessReconnectStatus> {
    if (record.sideEffectSafety === "IDEMPOTENT" || record.sideEffectSafety === "READ_ONLY") {
      if (!options?.dryRun) {
        const task = this.taskRepo.findById(record.taskId);
        if (task) {
          this.taskRepo.save({
            ...task,
            status: "queued",
            updatedAt: new Date().toISOString(),
            metadata: {
              ...task.metadata,
              requeuedReason: "Orphaned background process terminated; safe idempotent retry.",
            },
          });
        }
        this.eventStore.append({
          id: "evt_orph_retry_" + Date.now(),
          schemaVersion: 1,
          sessionId: record.sessionId,
          taskId: record.taskId,
          type: "process.orphan_retry",
          actor: "system",
          timestamp: new Date().toISOString(),
          payload: {
            executionId: record.executionId,
            pid: record.pid,
            sideEffectSafety: record.sideEffectSafety,
          },
        });
      }
      return "ORPHAN_SAFE_RETRY";
    } else {
      if (!options?.dryRun) {
        const task = this.taskRepo.findById(record.taskId);
        if (task) {
          this.taskRepo.save({
            ...task,
            status: "blocked",
            updatedAt: new Date().toISOString(),
            metadata: {
              ...task.metadata,
              blockedReason: "Orphaned background process terminated with unsafe side-effects; manual review required.",
            },
          });
        }
        this.eventStore.append({
          id: "evt_orph_block_" + Date.now(),
          schemaVersion: 1,
          sessionId: record.sessionId,
          taskId: record.taskId,
          type: "process.orphan_blocked",
          actor: "system",
          timestamp: new Date().toISOString(),
          payload: {
            executionId: record.executionId,
            pid: record.pid,
            sideEffectSafety: record.sideEffectSafety,
          },
        });
      }
      return "ORPHAN_BLOCKED_UNSAFE_SIDE_EFFECT";
    }
  }

  public async reconcileSessionProcesses(
    sessionId: string,
    options?: { dryRun?: boolean }
  ): Promise<ProcessReconciliationReport> {
    const records = this.listDetachedProcesses(sessionId);
    const details: ProcessReconciliationReport["details"] = [];
    let reattachedCount = 0;
    let harvestedCount = 0;
    let orphanedCount = 0;

    for (const record of records) {
      const inspection = await this.processInspector(record.pid);

      if (inspection.alive) {
        const identityMatched = await this.verifyProcessIdentity(record);
        if (identityMatched) {
          reattachedCount++;
          if (!options?.dryRun) {
            record.status = "running";
            record.lastHeartbeatAt = Date.now();
            this.registerDetachedProcess(record);

            this.eventStore.append({
              id: "evt_proc_reattach_" + Date.now(),
              schemaVersion: 1,
              sessionId: record.sessionId,
              taskId: record.taskId,
              type: "process.reattached",
              actor: "system",
              timestamp: new Date().toISOString(),
              payload: {
                executionId: record.executionId,
                pid: record.pid,
              },
            });
          }
          details.push({
            executionId: record.executionId,
            taskId: record.taskId,
            pid: record.pid,
            outcome: "REATTACHED_RUNNING",
            explanation: "OS process alive and verified. Reattached to session.",
          });
        } else {
          // Recycled PID collision
          if (!options?.dryRun) {
            record.status = "lost";
            this.registerDetachedProcess(record);
          }
          details.push({
            executionId: record.executionId,
            taskId: record.taskId,
            pid: record.pid,
            outcome: "PID_RECYCLED_MISMATCH",
            explanation: "OS PID is active but belongs to a different process (PID recycling detected).",
          });
        }
      } else {
        // Process is dead: check exit code file
        let exitCode: number | undefined;
        if (record.exitCodePath && existsSync(record.exitCodePath)) {
          try {
            const raw = readFileSync(record.exitCodePath, "utf-8").trim();
            exitCode = parseInt(raw, 10);
          } catch {}
        }

        if (exitCode !== undefined && !isNaN(exitCode)) {
          harvestedCount++;
          const outcome: ProcessReconnectStatus = exitCode === 0 ? "HARVESTED_COMPLETED" : "HARVESTED_FAILED";
          if (!options?.dryRun) {
            record.status = exitCode === 0 ? "completed" : "failed";
            this.registerDetachedProcess(record);

            const task = this.taskRepo.findById(record.taskId);
            if (task) {
              this.taskRepo.save({
                ...task,
                status: exitCode === 0 ? "completed" : "failed",
                updatedAt: new Date().toISOString(),
              });
            }

            this.eventStore.append({
              id: "evt_proc_harv_" + Date.now(),
              schemaVersion: 1,
              sessionId: record.sessionId,
              taskId: record.taskId,
              type: exitCode === 0 ? "process.completed" : "process.failed",
              actor: "system",
              timestamp: new Date().toISOString(),
              payload: {
                executionId: record.executionId,
                pid: record.pid,
                exitCode,
              },
            });
          }

          details.push({
            executionId: record.executionId,
            taskId: record.taskId,
            pid: record.pid,
            outcome,
            exitCode,
            explanation: `Process exited with code ${exitCode}. Harvested output and transitioned task status.`,
          });
        } else {
          // No exit code: process died during reboot/crash -> Orphan handling
          orphanedCount++;
          const orphanOutcome = await this.handleOrphanProcess(record, options);
          details.push({
            executionId: record.executionId,
            taskId: record.taskId,
            pid: record.pid,
            outcome: orphanOutcome,
            explanation: `Process died ungracefully without exit code. Handled as orphan (${orphanOutcome}).`,
          });
        }
      }
    }

    return {
      sessionId,
      totalInspected: records.length,
      reattachedCount,
      harvestedCount,
      orphanedCount,
      details,
      timestamp: new Date().toISOString(),
    };
  }
}
