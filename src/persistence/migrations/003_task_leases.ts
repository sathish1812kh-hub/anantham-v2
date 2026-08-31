import type { DatabaseSync } from "node:sqlite";
import type { Migration } from "./001_initial_core_schema.js";

export const migration003: Migration = {
  id: 3,
  name: "003_task_leases",
  up: (db: DatabaseSync) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS leases (
        id TEXT PRIMARY KEY NOT NULL,
        task_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        instance_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        generation INTEGER NOT NULL,
        acquired_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        last_heartbeat_at TEXT NOT NULL,
        ttl_ms INTEGER NOT NULL,
        status TEXT NOT NULL,
        renewal_count INTEGER NOT NULL,
        max_renewals INTEGER NOT NULL,
        metadata_json TEXT,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_leases_task_id ON leases(task_id);
      CREATE INDEX IF NOT EXISTS idx_leases_agent_instance ON leases(agent_id, instance_id);
      CREATE INDEX IF NOT EXISTS idx_leases_status_expires ON leases(status, expires_at);
      CREATE INDEX IF NOT EXISTS idx_leases_project_id ON leases(project_id);
    `);
  },
  down: (db: DatabaseSync) => {
    db.exec(`
      DROP TABLE IF EXISTS leases;
    `);
  },
};
