import { createHash } from "node:crypto";
import type { SqliteEngine } from "./sqlite-engine.js";
import { allMigrations, type Migration } from "./migrations/001_initial_core_schema.js";

export interface AppliedMigration {
  id: number;
  name: string;
  appliedAt: string;
  checksum: string;
}

/**
 * MigrationEngine manages schema versioning, tracking, and transactional execution.
 * PRD Part 1 Section 53 / Playbook Section 12.
 */
export class MigrationEngine {
  private readonly engine: SqliteEngine;

  constructor(engine: SqliteEngine) {
    this.engine = engine;
  }

  /**
   * Initializes the `_migrations` internal tracking table if it does not exist.
   */
  private initTrackingTable(): void {
    this.engine.raw.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id INTEGER PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        checksum TEXT NOT NULL
      );
    `);
  }

  /**
   * Computes a deterministic SHA-256 checksum for a migration.
   */
  public static computeChecksum(migration: Migration): string {
    const content = `${migration.id}:${migration.name}:${migration.up.toString()}`;
    return createHash("sha256").update(content).digest("hex");
  }

  /**
   * Retrieves the list of all applied migrations.
   */
  public getAppliedMigrations(): AppliedMigration[] {
    this.initTrackingTable();
    const stmt = this.engine.raw.prepare(`
      SELECT id, name, applied_at AS appliedAt, checksum
      FROM _migrations
      ORDER BY id ASC;
    `);
    return stmt.all() as unknown as AppliedMigration[];
  }

  /**
   * Applies all pending migrations within a transactional boundary.
   */
  public migrate(migrations: Migration[] = allMigrations): { appliedCount: number; currentVersion: number } {
    this.initTrackingTable();

    const applied = this.getAppliedMigrations();
    const appliedMap = new Map(applied.map((m) => [m.id, m]));

    // Validate that applied migrations have not been tampered with
    for (const migration of migrations) {
      const existing = appliedMap.get(migration.id);
      if (existing) {
        const currentChecksum = MigrationEngine.computeChecksum(migration);
        if (existing.checksum !== currentChecksum) {
          throw new Error(
            `Migration checksum mismatch for migration ${migration.id} (${migration.name}). ` +
            `Expected ${existing.checksum}, calculated ${currentChecksum}. Migrations are immutable.`
          );
        }
      }
    }

    // Sort pending migrations by ID ascending
    const pending = migrations
      .filter((m) => !appliedMap.has(m.id))
      .sort((a, b) => a.id - b.id);

    if (pending.length === 0) {
      const maxId = applied.length > 0 ? Math.max(...applied.map((m) => m.id)) : 0;
      return { appliedCount: 0, currentVersion: maxId };
    }

    let appliedCount = 0;
    for (const migration of pending) {
      this.engine.transaction(() => {
        migration.up(this.engine.raw);

        const checksum = MigrationEngine.computeChecksum(migration);
        const stmt = this.engine.raw.prepare(`
          INSERT INTO _migrations (id, name, applied_at, checksum)
          VALUES (?, ?, ?, ?);
        `);
        stmt.run(migration.id, migration.name, new Date().toISOString(), checksum);
        appliedCount++;
      });
    }

    const latest = this.getAppliedMigrations();
    const currentVersion = latest.length > 0 ? Math.max(...latest.map((m) => m.id)) : 0;

    return { appliedCount, currentVersion };
  }
}
