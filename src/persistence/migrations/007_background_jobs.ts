import type { DatabaseSync } from "node:sqlite";
import type { Migration } from "./001_initial_core_schema.js";

export const migration007: Migration = {
  id: 7,
  name: "007_background_jobs",
  up: (db: DatabaseSync) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS background_jobs (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        workflow_id TEXT,
        run_id TEXT,
        agent_id TEXT NOT NULL,
        instance_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        heartbeat_at TEXT,
        deadline TEXT,
        attempt INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        lease_id TEXT,
        generation INTEGER,
        budget_json TEXT,
        consumption_json TEXT,
        cancellation_requested_at TEXT,
        cancellation_reason TEXT,
        failure_classification TEXT,
        error_message TEXT,
        result_artifacts_json TEXT,
        result_data_json TEXT,
        checkpoint_id TEXT,
        metadata_json TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_project_status ON background_jobs(project_id, status);
      CREATE INDEX IF NOT EXISTS idx_jobs_task_id ON background_jobs(task_id);
      CREATE INDEX IF NOT EXISTS idx_jobs_agent_status ON background_jobs(agent_id, status);
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON background_jobs(status);
    `);
  },
  down: (db: DatabaseSync) => {
    db.exec(`
      DROP TABLE IF EXISTS background_jobs;
    `);
  },
};
