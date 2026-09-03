import { z } from "zod";
import { SqliteEngine } from "../persistence/sqlite-engine.js";
import { EventStore } from "../event-state/event-store.js";

export const QuotaPolicySchema = z.object({
  maxDatabaseSizeBytes: z.number().int().positive().default(10 * 1024 * 1024 * 1024),
  maxEventsPerSession: z.number().int().positive().default(10_000),
  maxArtifactSizeBytes: z.number().int().positive().default(500 * 1024 * 1024),
  maxArtifactsPerSession: z.number().int().positive().default(500),
  retentionDays: z.number().int().positive().default(90),
  enforcementMode: z.enum(["soft_warning", "hard_reject"]).default("hard_reject"),
});
export type QuotaPolicy = z.infer<typeof QuotaPolicySchema>;

export const QuotaUsageSchema = z.object({
  sessionId: z.string(),
  projectId: z.string().optional(),
  currentEventsCount: z.number().int().nonnegative(),
  currentArtifactCount: z.number().int().nonnegative(),
  currentArtifactSizeBytes: z.number().int().nonnegative(),
  violations: z.array(z.string()),
  withinLimits: z.boolean(),
  mode: z.enum(["soft_warning", "hard_reject"]),
});
export type QuotaUsage = z.infer<typeof QuotaUsageSchema>;

export const RetentionPurgeReportSchema = z.object({
  scannedSessions: z.number().int().nonnegative(),
  purgedSessions: z.number().int().nonnegative(),
  purgedEventsCount: z.number().int().nonnegative(),
  purgedArtifactsCount: z.number().int().nonnegative(),
  reclaimedBytes: z.number().int().nonnegative(),
  dryRun: z.boolean(),
  timestamp: z.string(),
});
export type RetentionPurgeReport = z.infer<typeof RetentionPurgeReportSchema>;

export class QuotaExceededError extends Error {
  public readonly usage: QuotaUsage;

  constructor(message: string, usage: QuotaUsage) {
    super(message);
    this.name = "QuotaExceededError";
    this.usage = usage;
  }
}

export interface DataRetentionManagerOptions {
  engine: SqliteEngine;
  eventStore?: EventStore;
  policy?: Partial<QuotaPolicy>;
}

export class DataRetentionManager {
  private readonly engine: SqliteEngine;
  private readonly eventStore?: EventStore;
  public readonly policy: QuotaPolicy;

  constructor(options: DataRetentionManagerOptions) {
    this.engine = options.engine;
    this.eventStore = options.eventStore;
    this.policy = QuotaPolicySchema.parse(options.policy ?? {});
  }

  public async checkQuota(sessionId: string, projectId?: string): Promise<QuotaUsage> {
    let currentEventsCount = 0;
    try {
      const row = this.engine.raw
        .prepare("SELECT COUNT(*) as cnt FROM events WHERE session_id = ?;")
        .get(sessionId) as any;
      currentEventsCount = Number(row?.cnt ?? 0);
    } catch {}

    let currentArtifactCount = 0;
    let currentArtifactSizeBytes = 0;
    try {
      const row = this.engine.raw
        .prepare("SELECT COUNT(*) as cnt, COALESCE(SUM(LENGTH(content_uri)), 0) as total_size FROM artifacts WHERE session_id = ?;")
        .get(sessionId) as any;
      currentArtifactCount = Number(row?.cnt ?? 0);
      currentArtifactSizeBytes = Number(row?.total_size ?? 0);
    } catch {}


    const violations: string[] = [];
    if (currentEventsCount >= this.policy.maxEventsPerSession) {
      violations.push("EVENT_QUOTA_EXCEEDED: Session has " + currentEventsCount + " events (max " + this.policy.maxEventsPerSession + ").");
    }
    if (currentArtifactCount >= this.policy.maxArtifactsPerSession) {
      violations.push("ARTIFACT_COUNT_QUOTA_EXCEEDED: Session has " + currentArtifactCount + " artifacts (max " + this.policy.maxArtifactsPerSession + ").");
    }
    if (currentArtifactSizeBytes >= this.policy.maxArtifactSizeBytes) {
      violations.push("ARLIFACT_SIZE_QUOTA_EXCEEDED: Session artifact size is " + currentArtifactSizeBytes + " bytes (max " + this.policy.maxArtifactSizeBytes + ").");
    }

    return {
      sessionId,
      projectId,
      currentEventsCount,
      currentArtifactCount,
      currentArtifactSizeBytes,
      violations,
      withinLimits: violations.length === 0,
      mode: this.policy.enforcementMode,
    };
  }

  public async assertQuotaWithinLimits(sessionId: string, projectId?: string): Promise<void> {
    const usage = await this.checkQuota(sessionId, projectId);
    if (!usage.withinLimits && this.policy.enforcementMode === "hard_reject") {
      throw new QuotaExceededError(
        "Quota limit exceeded for session " + (sessionId || "") + ": " + usage.violations.join("; "),
        usage
      );
    }
  }

  public async enforceRetentionPolicies(options?: {
    projectId?: string;
    dryRun?: boolean;
    now?: number;
  }): Promise<RetentionPurgeReport> {
    const now = options?.now ?? Date.now();
    const cutoffDate = new Date(now - this.policy.retentionDays * 86400000).toISOString();

    let sql = "SELECT id, project_id, updated_at FROM sessions WHERE updated_at < ?";
    const params: any[] = [cutoffDate];
    if (options?.projectId) {
      sql += " AND project_id = ?";
      params.push(options.projectId);
    }

    const expiredSessions = this.engine.raw.prepare(sql).all(...params) as any[];

    let purgedEventsCount = 0;
    let purgedArtifactsCount = 0;
    let reclaimedBytes = 0;
    let purgedSessions = 0;

    for (const sess of expiredSessions) {
      const sessionId = sess.id;

      const evtRow = this.engine.raw
        .prepare("SELECT COUNT(*) as cnt FROM events WHERE session_id = ?;")
        .get(sessionId) as any;
      const evtCount = Number(evtRow?.cnt ?? 0);

      const artRow = this.engine.raw
        .prepare("SELECT COUNT(*) as cnt, COALESCE(SUM(LENGTH(content_uri)), 0) as total_size FROM artifacts WHERE session_id = ?;")
        .get(sessionId) as any;
      const artCount = Number(artRow?.cnt ?? 0);
      const artSize = Number(artRow?.total_size ?? 0);

      purgedEventsCount += evtCount;
      purgedArtifactsCount += artCount;
      reclaimedBytes += artSize;
      purgedSessions++;

      if (!options?.dryRun) {
        this.engine.transaction(() => {
          this.engine.raw.prepare("DELETE FROM events WHERE session_id = ?;").run(sessionId);
          this.engine.raw.prepare("DELETE FROM artifacts WHERE session_id = ?;").run(sessionId);
          this.engine.raw.prepare("UPDATE sessions SET status = 'archived', updated_at = ? WHERE id = ?;").run(new Date(now).toISOString(), sessionId);
        });

        if (this.eventStore) {
          this.eventStore.append({
            id: "evt_gov_purge_" + Date.now(),
            schemaVersion: 1,
            projectId: sess.project_id,
            type: "governance.retention_purged",
            actor: "system",
            timestamp: new Date(now).toISOString(),
            payload: {
              sessionId,
              purgedEventsCount: evtCount,
              purgedArtifactsCount: artCount,
              cutoffDate,
            },
          });
        }
      }
    }

    return {
      scannedSessions: expiredSessions.length,
      purgedSessions,
      purgedEventsCount,
      purgedArtifactsCount,
      reclaimedBytes,
      dryRun: options?.dryRun ?? false,
      timestamp: new Date(now).toISOString(),
    };
  }

  public async exportProjectAuditLog(projectId: string): Promise<{ projectId: string; eventsCount: number; data: string }> {
    const rows = this.engine.raw
      .prepare("SELECT * FROM events WHERE project_id = ? ORDER BY timestamp ASC;")
      .all(projectId) as any[];

    const data = JSON.stringify(rows, null, 2);
    return {
      projectId,
      eventsCount: rows.length,
      data,
    };
  }
}
