import type { DatabaseSync } from "node:sqlite";
import type { Migration } from "./001_initial_core_schema.js";

export const migration006: Migration = {
  id: 6,
  name: "006_workflows_orchestration",
  up: (db: DatabaseSync) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        scope TEXT NOT NULL,
        status TEXT NOT NULL,
        description TEXT,
        concurrency_json TEXT NOT NULL,
        tasks_json TEXT NOT NULL,
        verify_json TEXT,
        budget_json TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS workflow_runs (
        id TEXT PRIMARY KEY NOT NULL,
        workflow_id TEXT NOT NULL,
        project_id TEXT,
        session_id TEXT NOT NULL,
        status TEXT NOT NULL,
        current_step_index INTEGER NOT NULL DEFAULT 0,
        completed_tasks_json TEXT NOT NULL,
        failed_tasks_json TEXT NOT NULL,
        running_tasks_json TEXT NOT NULL,
        task_results_json TEXT NOT NULL,
        pinned_versions_json TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        error_message TEXT,
        FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_workflows_name_version ON workflows(name, version);
      CREATE INDEX IF NOT EXISTS idx_workflows_scope ON workflows(scope);
      CREATE INDEX IF NOT EXISTS idx_workflow_runs_session ON workflow_runs(session_id);
      CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status);
    `);
  },
  down: (db: DatabaseSync) => {
    db.exec(`
      DROP TABLE IF EXISTS workflow_runs;
      DROP TABLE IF EXISTS workflows;
    `);
  },
};
