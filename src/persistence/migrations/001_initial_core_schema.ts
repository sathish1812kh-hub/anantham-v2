import type { DatabaseSync } from "node:sqlite";

export interface Migration {
  id: number;
  name: string;
  up: (db: DatabaseSync) => void;
  down?: (db: DatabaseSync) => void;
}

export const migration001: Migration = {
  id: 1,
  name: "001_initial_core_schema",
  up: (db: DatabaseSync) => {
    // 1. Projects
    db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL,
        status TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        model_profile TEXT NOT NULL,
        memory_namespace TEXT NOT NULL,
        orchestration_profile TEXT NOT NULL,
        trust_profile TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_opened_at TEXT NOT NULL,
        last_activity_at TEXT NOT NULL,
        metadata_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
      CREATE INDEX IF NOT EXISTS idx_projects_last_activity ON projects(last_activity_at);
    `);

    // 2. Sessions
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        branch TEXT NOT NULL,
        current_task_id TEXT,
        parent_session_id TEXT,
        status TEXT NOT NULL,
        model_profile TEXT NOT NULL,
        key_pool_profile TEXT NOT NULL,
        mode TEXT NOT NULL,
        permissions_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata_json TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_session_id) REFERENCES sessions(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
      CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at);
    `);

    // 3. Tasks
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        parent_id TEXT,
        objective TEXT NOT NULL,
        status TEXT NOT NULL,
        priority TEXT NOT NULL,
        agent_role TEXT,
        model_profile TEXT,
        key_pool_profile TEXT,
        permission_profile TEXT,
        dependencies_json TEXT NOT NULL,
        input_artifacts_json TEXT NOT NULL,
        output_artifacts_json TEXT NOT NULL,
        checkpoint_id TEXT,
        read_set_json TEXT,
        write_set_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata_json TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_session_id ON tasks(session_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
    `);

    // 4. Authoritative Append-Only Events
    db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY NOT NULL,
        schema_version INTEGER NOT NULL,
        project_id TEXT,
        session_id TEXT,
        task_id TEXT,
        agent_id TEXT,
        type TEXT NOT NULL,
        actor TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        correlation_id TEXT,
        parent_event_id TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_session_ts ON events(session_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
      CREATE INDEX IF NOT EXISTS idx_events_correlation_id ON events(correlation_id);
      CREATE INDEX IF NOT EXISTS idx_events_task_id ON events(task_id);
    `);

    // 5. Checkpoints
    db.exec(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        id TEXT PRIMARY KEY NOT NULL,
        type TEXT NOT NULL,
        project_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        manifest_json TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        created_at TEXT NOT NULL,
        validation_checksum TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_checkpoints_session_created ON checkpoints(session_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_checkpoints_sha256 ON checkpoints(sha256);
    `);

    // 6. Artifacts
    db.exec(`
      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY NOT NULL,
        type TEXT NOT NULL,
        project_id TEXT,
        session_id TEXT,
        task_id TEXT,
        agent_id TEXT,
        content_uri TEXT NOT NULL,
        preview_uri TEXT,
        sha256 TEXT NOT NULL,
        source_event_ids_json TEXT NOT NULL,
        verification_json TEXT,
        created_at TEXT NOT NULL,
        metadata_json TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_artifacts_sha256 ON artifacts(sha256);
      CREATE INDEX IF NOT EXISTS idx_artifacts_task_id ON artifacts(task_id);
      CREATE INDEX IF NOT EXISTS idx_artifacts_session_id ON artifacts(session_id);
    `);

    // 7. Attachments
    db.exec(`
      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        source TEXT NOT NULL,
        project_id TEXT,
        session_id TEXT,
        task_id TEXT,
        sensitivity TEXT NOT NULL,
        created_at TEXT NOT NULL,
        metadata_json TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_attachments_sha256 ON attachments(sha256);
      CREATE INDEX IF NOT EXISTS idx_attachments_session_id ON attachments(session_id);
      CREATE INDEX IF NOT EXISTS idx_attachments_project_id ON attachments(project_id);
    `);

    // 8. Memory Items
    db.exec(`
      CREATE TABLE IF NOT EXISTS memory_items (
        id TEXT PRIMARY KEY NOT NULL,
        scope TEXT NOT NULL,
        project_id TEXT,
        session_id TEXT,
        agent_id TEXT,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        confidence REAL NOT NULL,
        priority TEXT NOT NULL,
        source_event_ids_json TEXT NOT NULL,
        source_artifacts_json TEXT,
        created_at TEXT NOT NULL,
        last_validated_at TEXT,
        expires_at TEXT,
        sensitivity TEXT NOT NULL,
        tags_json TEXT,
        metadata_json TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_memory_scope ON memory_items(scope);
      CREATE INDEX IF NOT EXISTS idx_memory_project_scope ON memory_items(project_id, scope);
      CREATE INDEX IF NOT EXISTS idx_memory_priority ON memory_items(priority);
      CREATE INDEX IF NOT EXISTS idx_memory_expires_at ON memory_items(expires_at);
    `);
  },
};

import { migration002 } from "./002_memory_fts.js";
import { migration003 } from "./003_task_leases.js";
import { migration004 } from "./004_teams_subagents.js";
import { migration005 } from "./005_workspaces_parallel.js";
import { migration006 } from "./006_workflows_orchestration.js";

export const allMigrations: Migration[] = [migration001, migration002, migration003, migration004, migration005, migration006];
