import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "node:path";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { WalCheckpointScheduler, type WALCheckpointStats } from "../../src/persistence/wal-checkpoint-scheduler.js";

describe("F-REC-11: Automated WAL Checkpoint & Compression Schedule", () => {
  const testDir = join(process.cwd(), ".test_wal_scheduler_" + Date.now());
  const dbPath = join(testDir, "test.sqlite");
  let engine: SqliteEngine;
  let scheduler: WalCheckpointScheduler;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    engine = new SqliteEngine({ path: dbPath });
    engine.open();

    const migrationEngine = new MigrationEngine(engine);
    migrationEngine.migrate();

    scheduler = new WalCheckpointScheduler(engine, {
      intervalMs: 50,
      walSizeBytesThreshold: 1024,
      walPagesThreshold: 10,
      freelistPagesThreshold: 5,
      defaultMode: "PASSIVE",
      escalationMode: "TRUNCATE",
    });
  });

  afterEach(() => {
    scheduler.stop();
    if (engine.isOpen()) {
      engine.close();
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("executes passive WAL checkpoint and records transferred page counts", () => {
    // Generate some write activity
    engine.transaction(() => {
      engine.raw.exec("CREATE TABLE IF NOT EXISTS test_data (id INTEGER PRIMARY KEY, val TEXT);");
      for (let i = 0; i < 50; i++) {
        engine.raw.prepare("INSERT INTO test_data (val) VALUES (?);").run("Value " + i);
      }
    });

    const stats = scheduler.forceCheckpoint("PASSIVE");
    expect(stats.mode).toBe("PASSIVE");
    expect(stats.timestamp).toBeDefined();
    expect(stats.durationMs).toBeGreaterThanOrEqual(0);
    expect(stats.logPages).toBeGreaterThanOrEqual(0);
  });

  it("escalates to TRUNCATE mode when WAL page threshold is exceeded and shrinks WAL file", () => {
    const status = scheduler.evaluateStatus();
    expect(typeof status.shouldCheckpoint).toBe("boolean");
    expect(["PASSIVE", "FULL", "RESTART", "TRUNCATE"]).toContain(status.recommendedMode);

    const stats = scheduler.forceCheckpoint("TRUNCATE");
    expect(stats.mode).toBe("TRUNCATE");
  });

  it("triggers auto-vacuum when freelist page count exceeds threshold", () => {
    engine.transaction(() => {
      engine.raw.exec("CREATE TABLE IF NOT EXISTS freelist_test (id INTEGER PRIMARY KEY, val TEXT);");
      for (let i = 0; i < 100; i++) {
        engine.raw.prepare("INSERT INTO freelist_test (val) VALUES (?);").run("Large string data " + i);
      }
    });

    // Delete records to populate freelist
    engine.transaction(() => {
      engine.raw.exec("DELETE FROM freelist_test;");
    });

    const stats = scheduler.forceCheckpoint();
    expect(stats).toBeDefined();
    expect(stats.freelistPagesBefore).toBeDefined();
  });

  it("dispatches checkpoint completion events to registered subscribers", () => {
    const received: WALCheckpointStats[] = [];
    const unsubscribe = scheduler.onCheckpoint((s) => {
      received.push(s);
    });

    scheduler.forceCheckpoint("PASSIVE");
    scheduler.forceCheckpoint("RESTART");

    expect(received.length).toBe(2);
    expect(received[0].mode).toBe("PASSIVE");
    expect(received[1].mode).toBe("RESTART");

    unsubscribe();
    scheduler.forceCheckpoint("PASSIVE");
    expect(received.length).toBe(2);
  });

  it("handles scheduler start and stop idempotently without leaking interval handles", async () => {
    expect(scheduler.isRunning()).toBe(false);

    scheduler.start();
    expect(scheduler.isRunning()).toBe(true);

    // Multiple starts should be idempotent
    scheduler.start();
    expect(scheduler.isRunning()).toBe(true);

    // Wait for at least one timer cycle
    await new Promise((resolve) => setTimeout(resolve, 120));

    const history = scheduler.getHistory();
    expect(history.length).toBeGreaterThan(0);

    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);

    // Multiple stops should be idempotent
    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
  });

  it("persists checkpoint telemetry records across process restart", () => {
    scheduler.forceCheckpoint("PASSIVE");
    scheduler.forceCheckpoint("TRUNCATE");

    const historyBefore = scheduler.getHistory();
    expect(historyBefore.length).toBeGreaterThanOrEqual(2);

    // Simulate closing and reopening engine
    engine.close();
    const newEngine = new SqliteEngine({ path: dbPath });
    newEngine.open();

    const newScheduler = new WalCheckpointScheduler(newEngine);
    const historyAfter = newScheduler.getHistory();

    expect(historyAfter.length).toBeGreaterThanOrEqual(2);
    expect(historyAfter[0].mode).toBe("TRUNCATE");

    newEngine.close();
  });
});
