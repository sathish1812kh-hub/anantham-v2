import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { migration001 } from "../../src/persistence/migrations/001_initial_core_schema.js";

describe("MigrationEngine", () => {
  let engine: SqliteEngine;
  let migrator: MigrationEngine;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    migrator = new MigrationEngine(engine);
  });

  afterEach(() => {
    engine.close();
  });

  it("applies migration001 successfully and records history", () => {
    const result = migrator.migrate([migration001]);
    expect(result.appliedCount).toBe(1);
    expect(result.currentVersion).toBe(1);

    const history = migrator.getAppliedMigrations();
    expect(history).toHaveLength(1);
    expect(history[0]?.id).toBe(1);
    expect(history[0]?.name).toBe("001_initial_core_schema");
    expect(history[0]?.checksum).toHaveLength(64);
  });

  it("is idempotent: re-running applied migrations does nothing", () => {
    migrator.migrate([migration001]);
    const secondRun = migrator.migrate([migration001]);
    expect(secondRun.appliedCount).toBe(0);
    expect(secondRun.currentVersion).toBe(1);
  });

  it("detects tampering when applied migration checksum differs", () => {
    migrator.migrate([migration001]);

    const tamperedMigration = {
      ...migration001,
      name: "tampered_migration_name",
    };

    expect(() => migrator.migrate([tamperedMigration])).toThrow(
      /Migration checksum mismatch/
    );
  });
});
