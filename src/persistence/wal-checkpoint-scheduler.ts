import { existsSync, statSync } from "node:fs";
import { SqliteEngine } from "./sqlite-engine.js";

export type WALCheckpointMode = "PASSIVE" | "FULL" | "RESTART" | "TRUNCATE";

export interface WALCheckpointStats {
  timestamp: string;
  mode: WALCheckpointMode;
  busy: number;
  logPages: number;
  checkpointedPages: number;
  walSizeBytes: number;
  dbSizeBytes: number;
  durationMs: number;
  vacuumExecuted: boolean;
  freelistPagesBefore?: number;
  freelistPagesAfter?: number;
}

export interface WalCheckpointSchedulerConfig {
  intervalMs?: number;
  walSizeBytesThreshold?: number;
  walPagesThreshold?: number;
  freelistPagesThreshold?: number;
  defaultMode?: WALCheckpointMode;
  escalationMode?: WALCheckpointMode;
  adaptiveScheduling?: boolean;
}

export class WalCheckpointScheduler {
  private readonly engine: SqliteEngine;
  private readonly config: Required<WalCheckpointSchedulerConfig>;
  private timer: NodeJS.Timeout | null = null;
  private history: WALCheckpointStats[] = [];
  private listeners: Array<(stats: WALCheckpointStats) => void> = [];

  constructor(engine: SqliteEngine, config?: WalCheckpointSchedulerConfig) {
    this.engine = engine;
    this.config = {
      intervalMs: config?.intervalMs ?? 60_000,
      walSizeBytesThreshold: config?.walSizeBytesThreshold ?? 10 * 1024 * 1024,
      walPagesThreshold: config?.walPagesThreshold ?? 1000,
      freelistPagesThreshold: config?.freelistPagesThreshold ?? 500,
      defaultMode: config?.defaultMode ?? "PASSIVE",
      escalationMode: config?.escalationMode ?? "TRUNCATE",
      adaptiveScheduling: config?.adaptiveScheduling ?? false,
    };
  }

  public start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      this.runMaintenanceCycle().catch((err) => {
        console.error("[WalCheckpointScheduler] Error during maintenance cycle:", err);
      });
    }, this.config.intervalMs);
    // Unref timer so it does not block Node process exit in tests
    this.timer.unref();
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public isRunning(): boolean {
    return this.timer !== null;
  }

  private getWalDiskSizeBytes(): number {
    const dbPath = (this.engine as any).config?.path;
    if (!dbPath || dbPath === ":memory:") {
      return 0;
    }
    const walPath = dbPath + "-wal";
    if (existsSync(walPath)) {
      try {
        return statSync(walPath).size;
      } catch {
        return 0;
      }
    }
    return 0;
  }

  private getDbDiskSizeBytes(): number {
    const dbPath = (this.engine as any).config?.path;
    if (!dbPath || dbPath === ":memory:") {
      return 0;
    }
    if (existsSync(dbPath)) {
      try {
        return statSync(dbPath).size;
      } catch {
        return 0;
      }
    }
    return 0;
  }

  private getFreelistCount(): number {
    try {
      const row = this.engine.raw.prepare("PRAGMA freelist_count;").get() as { freelist_count?: number } | undefined;
      return row?.freelist_count ?? 0;
    } catch {
      return 0;
    }
  }

  public evaluateStatus(): {
    shouldCheckpoint: boolean;
    recommendedMode: WALCheckpointMode;
    shouldVacuum: boolean;
    walPages: number;
    walSizeBytes: number;
    freelistPages: number;
  } {
    const walSizeBytes = this.getWalDiskSizeBytes();
    const freelistPages = this.getFreelistCount();

    let walPages = 0;
    try {
      const row = this.engine.raw.prepare("PRAGMA wal_checkpoint(PASSIVE);").get() as { log?: number } | undefined;
      walPages = row?.log ?? 0;
    } catch {
      walPages = 0;
    }

    const shouldCheckpoint = walSizeBytes >= this.config.walSizeBytesThreshold || walPages >= this.config.walPagesThreshold;
    const shouldVacuum = freelistPages >= this.config.freelistPagesThreshold;
    const recommendedMode: WALCheckpointMode = walPages >= this.config.walPagesThreshold * 2
      ? this.config.escalationMode
      : this.config.defaultMode;

    return {
      shouldCheckpoint,
      recommendedMode,
      shouldVacuum,
      walPages,
      walSizeBytes,
      freelistPages,
    };
  }

  public forceCheckpoint(mode: WALCheckpointMode = this.config.defaultMode): WALCheckpointStats {
    const startTime = performance.now();
    const freelistBefore = this.getFreelistCount();
    let busy = 0;
    let logPages = 0;
    let checkpointedPages = 0;

    try {
      const row = this.engine.raw.prepare("PRAGMA wal_checkpoint(" + mode + ");").get() as { busy?: number; log?: number; checkpointed?: number } | undefined;
      busy = row?.busy ?? 0;
      logPages = row?.log ?? 0;
      checkpointedPages = row?.checkpointed ?? 0;
    } catch {
      // Fallback
      this.engine.raw.exec("PRAGMA wal_checkpoint(" + mode + ");");
    }

    let vacuumExecuted = false;
    if (freelistBefore >= this.config.freelistPagesThreshold) {
      try {
        this.engine.raw.exec("PRAGMA incremental_vacuum(100);");
        vacuumExecuted = true;
      } catch {
        // Ignored
      }
    }

    const freelistAfter = this.getFreelistCount();
    const durationMs = performance.now() - startTime;
    const stats: WALCheckpointStats = {
      timestamp: new Date().toISOString(),
      mode,
      busy,
      logPages,
      checkpointedPages,
      walSizeBytes: this.getWalDiskSizeBytes(),
      dbSizeBytes: this.getDbDiskSizeBytes(),
      durationMs,
      vacuumExecuted,
      freelistPagesBefore: freelistBefore,
      freelistPagesAfter: freelistAfter,
    };

    // Store in circular history buffer (max 100)
    this.history.unshift(stats);
    if (this.history.length > 100) {
      this.history.pop();
    }

    // Persist to telemetry table if available
    try {
      const stmt = this.engine.raw.prepare(`
        INSERT INTO wal_checkpoint_logs (timestamp, mode, busy, log_pages, checkpointed_pages, wal_size_bytes, db_size_bytes, duration_ms, vacuum_executed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
      `);
      stmt.run(
        stats.timestamp,
        stats.mode,
        stats.busy,
        stats.logPages,
        stats.checkpointedPages,
        stats.walSizeBytes,
        stats.dbSizeBytes,
        stats.durationMs,
        stats.vacuumExecuted ? 1 : 0
      );
    } catch {
      // Migration table may not be loaded yet in lightweight test setups
    }

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(stats);
      } catch (err) {
        console.error("[WalCheckpointScheduler] Error in checkpoint listener:", err);
      }
    }

    return stats;
  }

  public async runMaintenanceCycle(): Promise<WALCheckpointStats> {
    const evalStatus = this.evaluateStatus();
    const mode = evalStatus.shouldCheckpoint ? evalStatus.recommendedMode : this.config.defaultMode;
    return this.forceCheckpoint(mode);
  }

  public getHistory(): WALCheckpointStats[] {
    // If telemetry table exists, also load persisted logs
    try {
      const rows = this.engine.raw.prepare(`
        SELECT timestamp, mode, busy, log_pages as logPages, checkpointed_pages as checkpointedPages,
               wal_size_bytes as walSizeBytes, db_size_bytes as dbSizeBytes, duration_ms as durationMs,
               vacuum_executed as vacuumExecuted
        FROM wal_checkpoint_logs
        ORDER BY id DESC
        LIMIT 100;
      `).all() as any[];
      if (rows.length > 0) {
        return rows.map((r) => ({
          timestamp: r.timestamp,
          mode: r.mode as WALCheckpointMode,
          busy: Number(r.busy),
          logPages: Number(r.logPages),
          checkpointedPages: Number(r.checkpointedPages),
          walSizeBytes: Number(r.walSizeBytes),
          dbSizeBytes: Number(r.dbSizeBytes),
          durationMs: Number(r.durationMs),
          vacuumExecuted: Boolean(r.vacuumExecuted),
        }));
      }
    } catch {}

    return [...this.history];
  }

  public onCheckpoint(listener: (stats: WALCheckpointStats) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
}
