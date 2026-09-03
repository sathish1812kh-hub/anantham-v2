import type { DatabaseSync } from "node:sqlite";
import type { Migration } from "./001_initial_core_schema.js";

/**
 * Migration 011: Projection Delta Snapshots, WAL Maintenance Telemetry, Connector DLQ,
 * Detached Process Supervisions, and External Service Distributed Leases.
 * PRD Part 1 Section 35-53 / PRD Part 2 Section 306-308 / PRD Part 3 Section 109-110.
 */
export const migration011: Migration = {
  id: 11,
  name: "011_snapshots_and_wal_maintenance",
  up: (db: DatabaseSync) => {
    // 1. Projection Delta Snapshots Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS projection_snapshots (
        id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        event_sequence_number INTEGER NOT NULL,
        last_event_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        is_keyframe INTEGER NOT NULL DEFAULT 0,
        base_snapshot_id TEXT,
        session_state_json TEXT NOT NULL,
        task_states_json TEXT NOT NULL,
        projections_json TEXT NOT NULL,
        delta_diff_json TEXT,
        checksum TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (base_snapshot_id) REFERENCES projection_snapshots(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_snapshots_session_seq ON projection_snapshots(session_id, event_sequence_number);
      CREATE INDEX IF NOT EXISTS idx_snapshots_keyframe ON projection_snapshots(session_id, is_keyframe);
    `);

    // 2. WAL Checkpoint Maintenance Telemetry Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS wal_checkpoint_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        mode TEXT NOT NULL,
        busy INTEGER NOT NULL,
        log_pages INTEGER NOT NULL,
        checkpointed_pages INTEGER NOT NULL,
        wal_size_bytes INTEGER NOT NULL,
        db_size_bytes INTEGER NOT NULL,
        duration_ms REAL NOT NULL,
        vacuum_executed INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_wal_checkpoint_timestamp ON wal_checkpoint_logs(timestamp);
    `);

    // 3. Connector Dead-Letter Queue (DLQ) Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS connector_dlq (
        id TEXT PRIMARY KEY NOT NULL,
        connector_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        target_url TEXT NOT NULL,
        payload TEXT NOT NULL,
        headers_json TEXT NOT NULL DEFAULT "{}",
        error_reason TEXT NOT NULL,
        status_code INTEGER,
        attempt_count INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL,
        first_attempt_at TEXT NOT NULL,
        last_attempt_at TEXT NOT NULL,
        next_retry_at TEXT,
        metadata_json TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_connector_dlq_status ON connector_dlq(connector_id, status);
      CREATE INDEX IF NOT EXISTS idx_connector_dlq_project ON connector_dlq(project_id);
    `);

    // 4. Detached Background Processes Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS detached_processes (
        execution_id TEXT PRIMARY KEY NOT NULL,
        task_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        command TEXT NOT NULL,
        args_json TEXT NOT NULL DEFAULT "[]",
        cwd TEXT NOT NULL,
        pid INTEGER NOT NULL,
        process_start_time INTEGER NOT NULL,
        stdout_log_path TEXT NOT NULL,
        stderr_log_path TEXT NOT NULL,
        exit_code_path TEXT,
        side_effect_safety TEXT NOT NULL,
        lease_id TEXT,
        last_heartbeat_at INTEGER NOT NULL,
        status TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_detached_processes_session ON detached_processes(session_id, status);
    `);

    // 5. External Service Distributed Leases Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS external_service_leases (
        id TEXT PRIMARY KEY NOT NULL,
        lease_kind TEXT NOT NULL,
        target_resource_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        task_id TEXT,
        generation INTEGER NOT NULL,
        expires_at TEXT NOT NULL,
        last_heartbeat_at TEXT NOT NULL,
        ttl_ms INTEGER NOT NULL,
        status TEXT NOT NULL,
        credentials_ref TEXT,
        metadata_json TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ext_leases_session ON external_service_leases(session_id, status);
      CREATE INDEX IF NOT EXISTS idx_ext_leases_resource ON external_service_leases(target_resource_id);
    `);
  },
  down: (db: DatabaseSync) => {
    db.exec(`
      DROP TABLE IF EXISTS external_service_leases;
      DROP TABLE IF EXISTS detached_processes;
      DROP TABLE IF EXISTS connector_dlq;
      DROP TABLE IF EXISTS wal_checkpoint_logs;
      DROP TABLE IF EXISTS projection_snapshots;
    `);
  },
};
