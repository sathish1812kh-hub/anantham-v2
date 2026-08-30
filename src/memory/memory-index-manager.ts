import type { SqliteEngine } from "../persistence/sqlite-engine.js";
import type { MemoryItem } from "../domain/memory.js";

export interface IndexIntegrityReport {
  isValid: boolean;
  expectedCount: number;
  actualCount: number;
}

/**
 * MemoryIndexManager maintains the derived SQLite FTS5 index for full-text search.
 * INVARIANT: The index is derived state and 100% rebuildable from the authoritative memory_items table.
 * PRD Part 1 Section 64.
 */
export class MemoryIndexManager {
  private readonly engine: SqliteEngine;

  constructor(engine: SqliteEngine) {
    this.engine = engine;
  }

  /**
   * Indexes a single MemoryItem into the FTS5 virtual table.
   */
  public indexItem(item: MemoryItem): void {
    // Delete any existing FTS entry for this ID first
    this.removeItem(item.id);

    const stmt = this.engine.raw.prepare(`
      INSERT INTO memory_fts (id, content, tags, type, scope, project_id, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?);
    `);

    stmt.run(
      item.id,
      item.content,
      item.tags ? item.tags.join(" ") : "",
      item.type,
      item.scope,
      item.projectId ?? null,
      item.sessionId ?? null
    );
  }

  /**
   * Removes a MemoryItem from the FTS5 index.
   */
  public removeItem(id: string): void {
    const stmt = this.engine.raw.prepare("DELETE FROM memory_fts WHERE id = ?;");
    stmt.run(id);
  }

  /**
   * Drops all FTS entries and re-indexes all records from the authoritative memory_items table.
   * INVARIANT 2: Rebuildability guaranteed.
   */
  public rebuildIndex(): { indexedCount: number } {
    return this.engine.transaction(() => {
      // 1. Wipe FTS index
      this.engine.raw.exec("DELETE FROM memory_fts;");

      // 2. Fetch all authoritative items
      const stmt = this.engine.raw.prepare(`
        SELECT id, content, tags_json, type, scope, project_id, session_id
        FROM memory_items;
      `);
      const rows = stmt.all() as Array<{
        id: string;
        content: string;
        tags_json: string | null;
        type: string;
        scope: string;
        project_id: string | null;
        session_id: string | null;
      }>;

      // 3. Batch insert into FTS
      const insertStmt = this.engine.raw.prepare(`
        INSERT INTO memory_fts (id, content, tags, type, scope, project_id, session_id)
        VALUES (?, ?, ?, ?, ?, ?, ?);
      `);

      let count = 0;
      for (const row of rows) {
        let tagsStr = "";
        if (row.tags_json) {
          try {
            const tags = JSON.parse(row.tags_json);
            if (Array.isArray(tags)) tagsStr = tags.join(" ");
          } catch {
            // Ignore parse errors on tags
          }
        }

        insertStmt.run(
          row.id,
          row.content,
          tagsStr,
          row.type,
          row.scope,
          row.project_id,
          row.session_id
        );
        count++;
      }

      return { indexedCount: count };
    });
  }

  /**
   * Verifies that the FTS index count matches the authoritative SQLite memory table count.
   */
  public verifyIndexIntegrity(): IndexIntegrityReport {
    const authorCountStmt = this.engine.raw.prepare("SELECT COUNT(*) AS count FROM memory_items;");
    const authorRow = authorCountStmt.get() as { count: number };

    const ftsCountStmt = this.engine.raw.prepare("SELECT COUNT(*) AS count FROM memory_fts;");
    const ftsRow = ftsCountStmt.get() as { count: number };

    const expected = Number(authorRow.count);
    const actual = Number(ftsRow.count);

    return {
      isValid: expected === actual,
      expectedCount: expected,
      actualCount: actual,
    };
  }
}
