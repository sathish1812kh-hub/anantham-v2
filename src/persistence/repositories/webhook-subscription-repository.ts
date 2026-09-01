import {
  type OutboundWebhookSubscription,
  OutboundWebhookSubscriptionSchema,
} from "../../domain/integration.js";
import type { SqliteEngine } from "../sqlite-engine.js";

interface SubscriptionRow {
  id: string;
  project_id: string;
  target_url: string;
  events_json: string;
  secret_ref: string | null;
  status: string;
  retry_policy_json: string;
  created_at: string;
  updated_at: string;
}

export class WebhookSubscriptionRepository {
  private readonly engine: SqliteEngine;

  constructor(engine: SqliteEngine) {
    this.engine = engine;
  }

  private rowToSubscription(row: SubscriptionRow): OutboundWebhookSubscription {
    return OutboundWebhookSubscriptionSchema.parse({
      id: row.id,
      projectId: row.project_id,
      targetUrl: row.target_url,
      events: JSON.parse(row.events_json),
      secretRef: row.secret_ref ?? undefined,
      status: row.status,
      retryPolicy: JSON.parse(row.retry_policy_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  public save(sub: OutboundWebhookSubscription): void {
    const validated = OutboundWebhookSubscriptionSchema.parse(sub);
    const stmt = this.engine.raw.prepare(`
      INSERT INTO webhook_subscriptions (
        id, project_id, target_url, events_json, secret_ref, status, retry_policy_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        target_url = excluded.target_url,
        events_json = excluded.events_json,
        secret_ref = excluded.secret_ref,
        status = excluded.status,
        retry_policy_json = excluded.retry_policy_json,
        updated_at = excluded.updated_at;
    `);

    stmt.run(
      validated.id,
      validated.projectId,
      validated.targetUrl,
      JSON.stringify(validated.events),
      validated.secretRef ?? null,
      validated.status,
      JSON.stringify(validated.retryPolicy),
      validated.createdAt,
      validated.updatedAt
    );
  }

  public findById(id: string): OutboundWebhookSubscription | null {
    const stmt = this.engine.raw.prepare("SELECT * FROM webhook_subscriptions WHERE id = ?");
    const row = stmt.get(id) as SubscriptionRow | undefined;
    return row ? this.rowToSubscription(row) : null;
  }

  public listByProject(projectId: string): OutboundWebhookSubscription[] {
    const stmt = this.engine.raw.prepare(
      "SELECT * FROM webhook_subscriptions WHERE project_id = ? ORDER BY created_at DESC"
    );
    const rows = stmt.all(projectId) as unknown as SubscriptionRow[];
    return rows.map((r) => this.rowToSubscription(r));
  }

  public listActiveByProject(projectId: string): OutboundWebhookSubscription[] {
    const stmt = this.engine.raw.prepare(
      "SELECT * FROM webhook_subscriptions WHERE project_id = ? AND status = 'ACTIVE' ORDER BY created_at DESC"
    );
    const rows = stmt.all(projectId) as unknown as SubscriptionRow[];
    return rows.map((r) => this.rowToSubscription(r));
  }

  public delete(id: string): boolean {
    const stmt = this.engine.raw.prepare("DELETE FROM webhook_subscriptions WHERE id = ?");
    const res = stmt.run(id);
    return res.changes > 0;
  }
}
