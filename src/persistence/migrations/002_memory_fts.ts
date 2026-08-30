import type { Migration } from "./001_initial_core_schema.js";

export const migration002: Migration = {
  id: 2,
  name: "002_memory_fts",
  up: (db) => {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
        id UNINDEXED,
        content,
        tags,
        type,
        scope,
        project_id UNINDEXED,
        session_id UNINDEXED,
        tokenize = 'porter unicode61'
      );
    `);
  },
};
