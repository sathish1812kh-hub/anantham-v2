import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository, EventRepository } from "../../src/persistence/index.js";
import { join } from "node:path";
import { rmSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";

describe("Persistence Durability & Crash Recovery", () => {
  const testDbDir = join(tmpdir(), "anantham_test_durability");
  const testDbPath = join(testDbDir, "anantham_test.db");

  beforeEach(() => {
    if (existsSync(testDbDir)) {
      rmSync(testDbDir, { recursive: true, force: true });
    }
    mkdirSync(testDbDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDbDir)) {
      rmSync(testDbDir, { recursive: true, force: true });
    }
  });

  it("survives engine close and reopen with 100% committed data intact", () => {
    // 1. Initial process/connection
    const engine1 = new SqliteEngine({ path: testDbPath, synchronous: "FULL" });
    engine1.open();
    const migrator1 = new MigrationEngine(engine1);
    migrator1.migrate();

    const projectRepo1 = new ProjectRepository(engine1);
    projectRepo1.save({
      id: "proj_durable_01",
      name: "Durable Project",
      rootPath: "C:/herness",
      status: "active",
      tags: ["durability"],
      modelProfile: "m",
      memoryNamespace: "mem",
      orchestrationProfile: "o",
      trustProfile: "developer",
      createdAt: "2026-08-30T20:00:00.000Z",
      lastOpenedAt: "2026-08-30T20:00:00.000Z",
      lastActivityAt: "2026-08-30T20:00:00.000Z",
    });

    // Close first engine (simulating shutdown)
    engine1.close();

    // 2. Second process/connection (simulating restart)
    const engine2 = new SqliteEngine({ path: testDbPath, synchronous: "FULL" });
    engine2.open();

    const integrity = engine2.integrityCheck();
    expect(integrity.ok).toBe(true);

    const projectRepo2 = new ProjectRepository(engine2);
    const restored = projectRepo2.findById("proj_durable_01");

    expect(restored).not.toBeNull();
    expect(restored?.name).toBe("Durable Project");
    expect(restored?.tags).toEqual(["durability"]);

    engine2.close();
  });

  it("ensures uncommitted transactions leave zero orphaned records on crash", () => {
    const engine = new SqliteEngine({ path: testDbPath, synchronous: "FULL" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    const projectRepo = new ProjectRepository(engine);
    projectRepo.save({
      id: "proj_01",
      name: "Base Project",
      rootPath: "C:/p",
      status: "active",
      tags: [],
      modelProfile: "m",
      memoryNamespace: "mem",
      orchestrationProfile: "o",
      trustProfile: "developer",
      createdAt: "2026-08-30T20:00:00.000Z",
      lastOpenedAt: "2026-08-30T20:00:00.000Z",
      lastActivityAt: "2026-08-30T20:00:00.000Z",
    });

    const eventRepo = new EventRepository(engine);

    expect(() => {
      engine.transaction(() => {
        eventRepo.append({
          id: "evt_fail_01",
          schemaVersion: 1,
          projectId: "proj_01",
          type: "session.created",
          actor: "user",
          timestamp: "2026-08-30T20:00:00.000Z",
          payload: {},
        });
        throw new Error("Simulated system failure before commit");
      });
    }).toThrow("Simulated system failure before commit");

    expect(eventRepo.findById("evt_fail_01")).toBeNull();

    engine.close();
  });
});
