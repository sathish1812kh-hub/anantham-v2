import type { DatabaseSync } from "node:sqlite";
import type { Migration } from "./001_initial_core_schema.js";

export const migration008: Migration = {
  id: 8,
  name: "008_remote_nodes_dispatch",
  up: (db: DatabaseSync) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS remote_nodes (
        id TEXT PRIMARY KEY NOT NULL,
        node_version TEXT NOT NULL,
        runtime_version TEXT NOT NULL,
        capabilities_json TEXT NOT NULL,
        executor_profiles_json TEXT NOT NULL,
        supported_models_json TEXT NOT NULL,
        supported_tools_json TEXT NOT NULL,
        project_scope_json TEXT NOT NULL,
        status TEXT NOT NULL,
        endpoint_url TEXT NOT NULL,
        registered_at TEXT NOT NULL,
        last_heartbeat_at TEXT NOT NULL,
        auth_token_hash TEXT,
        metadata_json TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_remote_nodes_status ON remote_nodes(status);
      CREATE INDEX IF NOT EXISTS idx_remote_nodes_heartbeat ON remote_nodes(status, last_heartbeat_at);

      CREATE TABLE IF NOT EXISTS remote_dispatches (
        id TEXT PRIMARY KEY NOT NULL,
        job_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        workflow_id TEXT,
        run_id TEXT,
        agent_id TEXT NOT NULL,
        instance_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        plan_id TEXT,
        generation INTEGER NOT NULL,
        lease_id TEXT NOT NULL,
        required_capabilities_json TEXT NOT NULL,
        budget_json TEXT,
        deadline TEXT,
        payload_json TEXT,
        idempotency_key TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        metadata_json TEXT,
        FOREIGN KEY (node_id) REFERENCES remote_nodes(id) ON DELETE CASCADE,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_dispatches_node_status ON remote_dispatches(node_id, status);
      CREATE INDEX IF NOT EXISTS idx_dispatches_task_id ON remote_dispatches(task_id);
      CREATE INDEX IF NOT EXISTS idx_dispatches_project_status ON remote_dispatches(project_id, status);
      CREATE INDEX IF NOT EXISTS idx_dispatches_idempotency ON remote_dispatches(idempotency_key);
    `);
  },
  down: (db: DatabaseSync) => {
    db.exec(`
      DROP TABLE IF EXISTS remote_dispatches;
      DROP TABLE IF EXISTS remote_nodes;
    `);
  },
};
