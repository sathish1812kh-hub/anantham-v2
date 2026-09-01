import type { DatabaseSync } from "node:sqlite";
import type { Migration } from "./001_initial_core_schema.js";

/**
 * Migration 009: Integrations, Webhook Subscriptions & Deliveries.
 * PRD Part 2 Section 220–250.
 */
export const migration009: Migration = {
  id: 9,
  name: "009_integrations_webhooks",
  up: (db: DatabaseSync) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS integrations (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        config_json TEXT NOT NULL DEFAULT '{}',
        secret_ref TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_integrations_project ON integrations(project_id);
      CREATE INDEX IF NOT EXISTS idx_integrations_type ON integrations(type);

      CREATE TABLE IF NOT EXISTS webhook_subscriptions (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT NOT NULL,
        target_url TEXT NOT NULL,
        events_json TEXT NOT NULL DEFAULT '[]',
        secret_ref TEXT,
        status TEXT NOT NULL,
        retry_policy_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_webhook_subs_project ON webhook_subscriptions(project_id);

      CREATE TABLE IF NOT EXISTS webhook_deliveries (
        id TEXT PRIMARY KEY NOT NULL,
        subscription_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        attempt INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        status_code INTEGER,
        error TEXT,
        timestamp TEXT NOT NULL,
        next_retry_at TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_webhook_deliv_sub ON webhook_deliveries(subscription_id);
      CREATE INDEX IF NOT EXISTS idx_webhook_deliv_status ON webhook_deliveries(status);
    `);
  },
};
