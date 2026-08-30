import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface DatabaseConfig {
  /**
   * Path to the SQLite database file, or ':memory:' for an in-memory database.
   */
  path: string;
  /**
   * Synchronous mode: 'FULL' (default, maximum durability RPO 0), 'NORMAL', 'OFF'.
   */
  synchronous?: "FULL" | "NORMAL" | "OFF";
  /**
   * Busy timeout in milliseconds. Defaults to 5000ms.
   */
  busyTimeoutMs?: number;
  /**
   * Read-only mode. Defaults to false.
   */
  readOnly?: boolean;
}

export interface IntegrityCheckResult {
  ok: boolean;
  messages: string[];
}

/**
 * Anantham V2 Authoritative SQLite Engine.
 * PRD Part 1 Section 43-45 (PRD-DUR-001) / Tech Stack Section 4.
 */
export class SqliteEngine {
  private db: DatabaseSync | null = null;
  private readonly config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = {
      path: config.path,
      synchronous: config.synchronous ?? "FULL",
      busyTimeoutMs: config.busyTimeoutMs ?? 5000,
      readOnly: config.readOnly ?? false,
    };
  }

  /**
   * Initializes and opens the SQLite database with strict durability pragmas.
   */
  public open(): void {
    if (this.db) {
      return;
    }

    if (this.config.path !== ":memory:") {
      const dir = dirname(this.config.path);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new DatabaseSync(this.config.path, {
      readOnly: this.config.readOnly,
    });

    // Apply strict Anantham durability and relational pragmas
    if (this.config.path !== ":memory:") {
      this.db.exec("PRAGMA journal_mode = WAL;");
    }
    this.db.exec(`PRAGMA synchronous = ${this.config.synchronous};`);
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec(`PRAGMA busy_timeout = ${this.config.busyTimeoutMs};`);
  }

  /**
   * Returns the underlying native DatabaseSync instance.
   */
  public get raw(): DatabaseSync {
    if (!this.db) {
      throw new Error("SqliteEngine is not opened. Call open() first.");
    }
    return this.db;
  }

  /**
   * Checks whether the database connection is currently open.
   */
  public isOpen(): boolean {
    return this.db !== null;
  }

  /**
   * Closes the database connection.
   */
  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Executes a callback within a transactional boundary.
   * If the callback throws, the transaction is automatically rolled back.
   * If the callback succeeds, the transaction is committed.
   */
  public transaction<T>(fn: () => T): T {
    if (!this.db) {
      throw new Error("Cannot run transaction on closed database.");
    }

    this.db.exec("BEGIN IMMEDIATE TRANSACTION;");
    try {
      const result = fn();
      this.db.exec("COMMIT;");
      return result;
    } catch (error) {
      try {
        this.db.exec("ROLLBACK;");
      } catch {
        // Rollback error secondary to original throw
      }
      throw error;
    }
  }

  /**
   * Executes PRAGMA integrity_check to verify database health.
   */
  public integrityCheck(): IntegrityCheckResult {
    if (!this.db) {
      throw new Error("Cannot run integrity check on closed database.");
    }

    const stmt = this.db.prepare("PRAGMA integrity_check;");
    const rows = stmt.all() as Array<Record<string, unknown>>;
    const messages = rows.map((r) => String(Object.values(r)[0] ?? ""));

    const ok = messages.length === 1 && messages[0] === "ok";
    return { ok, messages };
  }

  /**
   * Executes PRAGMA foreign_key_check to verify referential integrity.
   */
  public foreignKeyCheck(): { ok: boolean; violations: Array<Record<string, unknown>> } {
    if (!this.db) {
      throw new Error("Cannot run foreign key check on closed database.");
    }

    const stmt = this.db.prepare("PRAGMA foreign_key_check;");
    const violations = stmt.all() as Array<Record<string, unknown>>;
    return { ok: violations.length === 0, violations };
  }
}
