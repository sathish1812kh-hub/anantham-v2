import type { DatabaseSync } from "node:sqlite";
import type { Migration } from "./001_initial_core_schema.js";

export const migration005: Migration = {
  id: 5,
  name: "005_workspaces_parallel",
  up: (db: DatabaseSync) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        instance_id TEXT NOT NULL,
        lease_id TEXT NOT NULL,
        generation INTEGER NOT NULL,
        base_commit TEXT NOT NULL,
        base_branch TEXT NOT NULL,
        worktree_path TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        status TEXT NOT NULL,
        cleanup_state TEXT NOT NULL,
        quarantine_reason TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        last_verified_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (lease_id) REFERENCES leases(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS workspace_changesets (
        workspace_id TEXT PRIMARY KEY NOT NULL,
        base_commit TEXT NOT NULL,
        head_commit TEXT NOT NULL,
        target_commit TEXT NOT NULL,
        files_added_json TEXT NOT NULL,
        files_modified_json TEXT NOT NULL,
        files_deleted_json TEXT NOT NULL,
        files_renamed_json TEXT NOT NULL,
        file_hashes_json TEXT NOT NULL,
        symbols_modified_json TEXT,
        patch TEXT NOT NULL,
        change_set_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS workspace_conflict_reports (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL,
        conflicting_workspace_id TEXT,
        conflict_type TEXT NOT NULL,
        conflicting_files_json TEXT NOT NULL,
        conflicting_symbols_json TEXT,
        details TEXT NOT NULL,
        suggestion TEXT,
        detected_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS workspace_quarantine_records (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        patch TEXT NOT NULL,
        exported_artifact_id TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_workspaces_project ON workspaces(project_id);
      CREATE INDEX IF NOT EXISTS idx_workspaces_task ON workspaces(task_id);
      CREATE INDEX IF NOT EXISTS idx_workspaces_lease ON workspaces(lease_id);
      CREATE INDEX IF NOT EXISTS idx_workspaces_status ON workspaces(status);
      CREATE INDEX IF NOT EXISTS idx_workspace_conflicts_ws ON workspace_conflict_reports(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_workspace_quarantine_ws ON workspace_quarantine_records(workspace_id);
    `);
  },
  down: (db: DatabaseSync) => {
    db.exec(`
      DROP TABLE IF EXISTS workspace_quarantine_records;
      DROP TABLE IF EXISTS workspace_conflict_reports;
      DROP TABLE IF EXISTS workspace_changesets;
      DROP TABLE IF EXISTS workspaces;
    `);
  },
};
