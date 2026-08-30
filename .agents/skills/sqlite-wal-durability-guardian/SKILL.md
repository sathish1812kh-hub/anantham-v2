---
name: sqlite-wal-durability-guardian
description: Manages Node.js native node:sqlite transactions, WAL mode, synchronous=FULL, foreign key cascades, and migration schema integrity in Anantham V2.
---

# SQLite WAL Durability Guardian Skill

Use this skill when modifying database schemas, writing repositories, configuring migrations, or validating SQLite persistence.

## Core Rules

1. **RPO-0 Invariant**:
   - Every SQLite connection MUST execute:
     ```sql
     PRAGMA journal_mode = WAL;
     PRAGMA synchronous = FULL;
     PRAGMA foreign_keys = ON;
     ```
2. **Transactional Units of Work**:
   - Multi-step persistence operations must be enclosed in `db.transaction(() => { ... })()`.
3. **Migration Checksum Validation**:
   - Migrations are tracked with SHA-256 checksums in `_migrations`. Tampered or altered migrations must throw immediately.
4. **Native Node.js `node:sqlite` Only**:
   - Zero external binary dependencies (`better-sqlite3`, etc.).
