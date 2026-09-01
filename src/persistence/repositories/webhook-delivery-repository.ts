import {
  type WebhookDeliveryRecord,
  WebhookDeliveryRecordSchema,
} from "../../domain/integration.js";
import type { SqliteEngine } from "../sqlite-engine.js";

interface DeliveryRow {
  id: string;
  subscription_id: string;
  project_id: string;
  event_id: string;
  attempt: number;
  status: string;
  status_code: number | null;
  error: string | null;
  timestamp: string;
  next_retry_at: string | null;
  metadata_json: string;
}

export class WebhookDeliveryRepository {
  private readonly engine: SqliteEngine;

  constructor(engine: SqliteEngine) {
    this.engine = engine;
  }

  private rowToDelivery(row: DeliveryRow): WebhookDeliveryRecord {
    return WebhookDeliveryRecordSchema.parse({
      id: row.id,
      subscriptionId: row.subscription_id,
      projectId: row.project_id,
      eventId: row.event_id,
      attempt: row.attempt,
      status: row.status,
      statusCode: row.status_code ?? undefined,
      error: row.error ?? undefined,
      timestamp: row.timestamp,
      nextRetryAt: row.next_retry_at ?? undefined,
      metadata: JSON.parse(row.metadata_json),
    });
  }

  public save(delivery: WebhookDeliveryRecord): void {
    const validated = WebhookDeliveryRecordSchema.parse(delivery);
    const stmt = this.engine.raw.prepare(`
      INSERT INTO webhook_deliveries (
        id, subscription_id, project_id, event_id, attempt, status, status_code, error, timestamp, next_retry_at, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        attempt = excluded.attempt,
        status = excluded.status,
        status_code = excluded.status_code,
        error = excluded.error,
        timestamp = excluded.timestamp,
        next_retry_at = excluded.next_retry_at,
        metadata_json = excluded.metadata_json;
    `);

    stmt.run(
      validated.id,
      validated.subscriptionId,
      validated.projectId,
      validated.eventId,
      validated.attempt,
      validated.status,
      validated.statusCode ?? null,
      validated.error ?? null,
      validated.timestamp,
      validated.nextRetryAt ?? null,
      JSON.stringify(validated.metadata ?? {})
    );
  }

  public findById(id: string): WebhookDeliveryRecord | null {
    const stmt = this.engine.raw.prepare("SELECT * FROM webhook_deliveries WHERE id = ?");
    const row = stmt.get(id) as DeliveryRow | undefined;
    return row ? this.rowToDelivery(row) : null;
  }

  public listBySubscription(subscriptionId: string): WebhookDeliveryRecord[] {
    const stmt = this.engine.raw.prepare(
      "SELECT * FROM webhook_deliveries WHERE subscription_id = ? ORDER BY timestamp DESC"
    );
    const rows = stmt.all(subscriptionId) as unknown as DeliveryRow[];
    return rows.map((r) => this.rowToDelivery(r));
  }

  public listPending(): WebhookDeliveryRecord[] {
    const stmt = this.engine.raw.prepare(
      "SELECT * FROM webhook_deliveries WHERE status = 'PENDING' ORDER BY timestamp ASC"
    );
    const rows = stmt.all() as unknown as DeliveryRow[];
    return rows.map((r) => this.rowToDelivery(r));
  }
}
