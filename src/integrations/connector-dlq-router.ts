import { randomBytes } from "node:crypto";
import { z } from "zod";
import { SqliteEngine } from "../persistence/sqlite-engine.js";
import { EventStore } from "../event-state/event-store.js";

export const CircuitBreakerStateSchema = z.enum(["CLOSED", "OPEN", "HALF_OPEN"]);
export type CircuitBreakerState = z.infer<typeof CircuitBreakerStateSchema>;

export const ConnectorTimeoutConfigSchema = z.object({
  connectTimeoutMs: z.number().int().positive().default(5_000),
  readTimeoutMs: z.number().int().positive().default(10_000),
  overallTimeoutMs: z.number().int().positive().default(15_000),
  maxRetries: z.number().int().nonnegative().default(3),
  circuitBreakerThreshold: z.number().int().positive().default(5),
  circuitBreakerCooldownMs: z.number().int().positive().default(30_000),
});
export type ConnectorTimeoutConfig = z.infer<typeof ConnectorTimeoutConfigSchema>;

export const DLQStatusSchema = z.enum(["PENDING", "RETRYING", "RESOLVED", "PURGED"]);
export type DLQStatus = z.infer<typeof DLQStatusSchema>;

export const DLQRecordSchema = z.object({
  id: z.string().min(1),
  connectorId: z.string().min(1),
  projectId: z.string().min(1),
  targetUrl: z.string().url(),
  payload: z.string(),
  headers: z.record(z.string()),
  errorReason: z.string(),
  statusCode: z.number().int().optional(),
  attemptCount: z.number().int().positive(),
  status: DLQStatusSchema,
  firstAttemptAt: z.string(),
  lastAttemptAt: z.string(),
  nextRetryAt: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type DLQRecord = z.infer<typeof DLQRecordSchema>;

export type HttpSenderFn = (
  url: string,
  body: string,
  headers: Record<string, string>,
  signal: AbortSignal
) => Promise<{ status: number; ok: boolean; error?: string }>;

export interface ConnectorDLQRouterOptions {
  engine: SqliteEngine;
  eventStore?: EventStore;
  config?: Partial<ConnectorTimeoutConfig>;
  httpSender?: HttpSenderFn;
}

interface CircuitBreakerTracker {
  state: CircuitBreakerState;
  consecutiveFailures: number;
  nextProbeAt?: number;
}

export class ConnectorDLQRouter {
  private readonly engine: SqliteEngine;
  private readonly eventStore?: EventStore;
  private readonly config: ConnectorTimeoutConfig;
  private readonly httpSender: HttpSenderFn;
  private readonly breakers: Map<string, CircuitBreakerTracker> = new Map();

  constructor(options: ConnectorDLQRouterOptions) {
    this.engine = options.engine;
    this.eventStore = options.eventStore;
    this.config = ConnectorTimeoutConfigSchema.parse(options.config ?? {});
    this.httpSender = options.httpSender ?? (async (url, body, headers, signal) => {
      try {
        const res = await fetch(url, {
          method: "POST",
          body,
          headers: { "Content-Type": "application/json", ...headers },
          signal,
        });
        return { status: res.status, ok: res.ok };
      } catch (err: any) {
        return { status: 0, ok: false, error: err.message };
      }
    });
  }

  private getTracker(connectorId: string): CircuitBreakerTracker {
    let tracker = this.breakers.get(connectorId);
    if (!tracker) {
      tracker = { state: "CLOSED", consecutiveFailures: 0 };
      this.breakers.set(connectorId, tracker);
    }

    // Check transition from OPEN to HALF_OPEN
    if (tracker.state === "OPEN" && tracker.nextProbeAt && Date.now() >= tracker.nextProbeAt) {
      tracker.state = "HALF_OPEN";
    }

    return tracker;
  }

  private recordSuccess(connectorId: string): void {
    const tracker = this.getTracker(connectorId);
    tracker.state = "CLOSED";
    tracker.consecutiveFailures = 0;
    tracker.nextProbeAt = undefined;
  }

  private recordFailure(connectorId: string): void {
    const tracker = this.getTracker(connectorId);
    tracker.consecutiveFailures++;
    if (tracker.consecutiveFailures >= this.config.circuitBreakerThreshold) {
      tracker.state = "OPEN";
      tracker.nextProbeAt = Date.now() + this.config.circuitBreakerCooldownMs;
    }
  }

  public getCircuitBreakerState(connectorId: string): { state: CircuitBreakerState; consecutiveFailures: number; nextProbeAt?: number } {
    const tracker = this.getTracker(connectorId);
    return {
      state: tracker.state,
      consecutiveFailures: tracker.consecutiveFailures,
      nextProbeAt: tracker.nextProbeAt,
    };
  }

  private insertDLQ(
    connectorId: string,
    projectId: string,
    targetUrl: string,
    payload: string,
    headers: Record<string, string>,
    errorReason: string,
    statusCode?: number,
    attemptCount: number = 1
  ): DLQRecord {
    const id = "dlq_" + Date.now() + "_" + randomBytes(4).toString("hex");
    const now = new Date().toISOString();

    const record: DLQRecord = {
      id,
      connectorId,
      projectId,
      targetUrl,
      payload,
      headers,
      errorReason,
      statusCode,
      attemptCount,
      status: "PENDING",
      firstAttemptAt: now,
      lastAttemptAt: now,
    };

    try {
      const stmt = this.engine.raw.prepare(`
        INSERT INTO connector_dlq (
          id, connector_id, project_id, target_url, payload,
          headers_json, error_reason, status_code, attempt_count,
          status, first_attempt_at, last_attempt_at, next_retry_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `);
      stmt.run(
        record.id,
        record.connectorId,
        record.projectId,
        record.targetUrl,
        record.payload,
        JSON.stringify(record.headers),
        record.errorReason,
        record.statusCode ?? null,
        record.attemptCount,
        record.status,
        record.firstAttemptAt,
        record.lastAttemptAt,
        record.nextRetryAt ?? null,
        record.metadata ? JSON.stringify(record.metadata) : null
      );
    } catch {}

    if (this.eventStore) {
      this.eventStore.append({
        id: "evt_dlq_" + Date.now() + "_" + randomBytes(3).toString("hex"),
        schemaVersion: 1,
        projectId,
        type: "connector.dlq_routed",
        actor: "system",
        timestamp: now,
        payload: {
          dlqId: id,
          connectorId,
          targetUrl,
          errorReason,
          statusCode,
        },
      });
    }

    return record;
  }

  public async dispatch(
    connectorId: string,
    projectId: string,
    targetUrl: string,
    payload: string,
    headers: Record<string, string> = {}
  ): Promise<{ success: boolean; dlqRecord?: DLQRecord; statusCode?: number; error?: string }> {
    const tracker = this.getTracker(connectorId);

    // Fast-fail if Circuit is OPEN
    if (tracker.state === "OPEN") {
      const dlq = this.insertDLQ(
        connectorId,
        projectId,
        targetUrl,
        payload,
        headers,
        "CIRCUIT_OPEN: Target service circuit breaker is OPEN due to repeated failures."
      );
      return { success: false, dlqRecord: dlq, error: "Circuit breaker OPEN" };
    }

    let attempts = 0;
    let lastError = "";
    let lastStatus = 0;

    while (attempts < this.config.maxRetries) {
      attempts++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.overallTimeoutMs);

      try {
        const result = await this.httpSender(targetUrl, payload, headers, controller.signal);
        clearTimeout(timer);
        lastStatus = result.status;

        if (result.ok) {
          this.recordSuccess(connectorId);
          return { success: true, statusCode: result.status };
        }

        // Poison pill detection (400 Bad Request, 422 Unprocessable Entity) - don't retry
        if (result.status === 400 || result.status === 422) {
          this.recordFailure(connectorId);
          const dlq = this.insertDLQ(
            connectorId,
            projectId,
            targetUrl,
            payload,
            headers,
            "POISON_PILL: Permanent HTTP " + result.status + " error: " + (result.error ?? "Invalid client payload"),
            result.status,
            attempts
          );
          return { success: false, dlqRecord: dlq, statusCode: result.status, error: result.error };
        }

        lastError = result.error ?? "HTTP " + result.status;
        this.recordFailure(connectorId);
      } catch (err: any) {
        clearTimeout(timer);
        lastError = err.message ?? "Network error";
        this.recordFailure(connectorId);
      }
    }

    // Exhausted retries -> Route to DLQ
    const dlq = this.insertDLQ(
      connectorId,
      projectId,
      targetUrl,
      payload,
      headers,
      "RETRY_EXHAUSTED: Failed after " + attempts + " attempts. Last error: " + lastError,
      lastStatus,
      attempts
    );

    return {
      success: false,
      dlqRecord: dlq,
      statusCode: lastStatus,
      error: lastError,
    };
  }

  public async replayDLQ(dlqId: string): Promise<{ success: boolean; error?: string }> {
    const item = this.listDLQ().find((r) => r.id === dlqId);
    if (!item) {
      return { success: false, error: "DLQ item not found: " + dlqId };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.overallTimeoutMs);
      const result = await this.httpSender(item.targetUrl, item.payload, item.headers, controller.signal);
      clearTimeout(timer);

      if (result.ok) {
        try {
          this.engine.raw.prepare("UPDATE connector_dlq SET status = 'RESOLVED', last_attempt_at = ? WHERE id = ?;").run(new Date().toISOString(), dlqId);
        } catch {}
        return { success: true };
      } else {
        try {
          this.engine.raw.prepare("UPDATE connector_dlq SET attempt_count = attempt_count + 1, last_attempt_at = ? WHERE id = ?;").run(new Date().toISOString(), dlqId);
        } catch {}
        return { success: false, error: result.error ?? "HTTP " + result.status };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public listDLQ(filter?: { connectorId?: string; projectId?: string; status?: DLQStatus }): DLQRecord[] {
    try {
      let sql = "SELECT * FROM connector_dlq WHERE 1=1";
      const params: any[] = [];
      if (filter?.connectorId) {
        sql += " AND connector_id = ?";
        params.push(filter.connectorId);
      }
      if (filter?.projectId) {
        sql += " AND project_id = ?";
        params.push(filter.projectId);
      }
      if (filter?.status) {
        sql += " AND status = ?";
        params.push(filter.status);
      }
      sql += " ORDER BY first_attempt_at DESC;";

      const rows = this.engine.raw.prepare(sql).all(...params) as any[];
      return rows.map((r) => ({
        id: r.id,
        connectorId: r.connector_id,
        projectId: r.project_id,
        targetUrl: r.target_url,
        payload: r.payload,
        headers: JSON.parse(r.headers_json || "{}"),
        errorReason: r.error_reason,
        statusCode: r.status_code ?? undefined,
        attemptCount: Number(r.attempt_count),
        status: r.status as DLQStatus,
        firstAttemptAt: r.first_attempt_at,
        lastAttemptAt: r.last_attempt_at,
        nextRetryAt: r.next_retry_at ?? undefined,
        metadata: r.metadata_json ? JSON.parse(r.metadata_json) : undefined,
      }));
    } catch {
      return [];
    }
  }

  public purgeDLQ(dlqId: string): boolean {
    try {
      const res = this.engine.raw.prepare("DELETE FROM connector_dlq WHERE id = ?;").run(dlqId);
      return Number(res.changes) > 0;
    } catch {
      return false;
    }
  }
}
