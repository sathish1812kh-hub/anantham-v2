import type { DatabaseSync } from "node:sqlite";
import type { Migration } from "./001_initial_core_schema.js";

export const migration004: Migration = {
  id: 4,
  name: "004_teams_subagents",
  up: (db: DatabaseSync) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY NOT NULL,
        version INTEGER NOT NULL,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        topology TEXT NOT NULL,
        status TEXT NOT NULL,
        definition_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS team_members (
        team_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        instance_id TEXT NOT NULL,
        role TEXT NOT NULL,
        status TEXT NOT NULL,
        joined_at TEXT NOT NULL,
        metadata_json TEXT,
        PRIMARY KEY (team_id, instance_id),
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS peer_messages (
        id TEXT PRIMARY KEY NOT NULL,
        team_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        sender_agent_id TEXT NOT NULL,
        sender_instance_id TEXT NOT NULL,
        recipient_agent_id TEXT NOT NULL,
        message_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        task_ref TEXT,
        artifact_refs_json TEXT,
        timestamp TEXT NOT NULL,
        correlation_id TEXT,
        causation_id TEXT,
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS agent_handoffs (
        id TEXT PRIMARY KEY NOT NULL,
        team_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        source_agent_id TEXT NOT NULL,
        source_instance_id TEXT NOT NULL,
        target_agent_id TEXT NOT NULL,
        target_instance_id TEXT,
        task_id TEXT NOT NULL,
        lease_id TEXT NOT NULL,
        generation INTEGER NOT NULL,
        status TEXT NOT NULL,
        details_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_teams_project ON teams(project_id);
      CREATE INDEX IF NOT EXISTS idx_team_members_agent ON team_members(agent_id);
      CREATE INDEX IF NOT EXISTS idx_peer_messages_team ON peer_messages(team_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_agent_handoffs_task ON agent_handoffs(task_id);
    `);
  },
  down: (db: DatabaseSync) => {
    db.exec(`
      DROP TABLE IF EXISTS agent_handoffs;
      DROP TABLE IF EXISTS peer_messages;
      DROP TABLE IF EXISTS team_members;
      DROP TABLE IF EXISTS teams;
    `);
  },
};
