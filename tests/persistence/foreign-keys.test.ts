import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";

describe("Persistence Foreign Key Referential Integrity", () => {
  let engine: SqliteEngine;
  let migrator: MigrationEngine;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    migrator = new MigrationEngine(engine);
    migrator.migrate();
  });

  afterEach(() => {
    engine.close();
  });

  it("rejects creating a session for a non-existent project", () => {
    const stmt = engine.raw.prepare(`
      INSERT INTO sessions (
        id, project_id, name, branch, status, model_profile,
        key_pool_profile, mode, permissions_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);

    expect(() => {
      stmt.run(
        "sess_01",
        "non_existent_project",
        "Session 1",
        "main",
        "active",
        "default",
        "pool",
        "interactive",
        "{}",
        new Date().toISOString(),
        new Date().toISOString()
      );
    }).toThrow(/FOREIGN KEY constraint failed/);
  });

  it("cascades deletion of project to associated sessions and tasks", () => {
    // 1. Create project
    engine.raw.prepare(`
      INSERT INTO projects (
        id, name, root_path, status, tags_json, model_profile,
        memory_namespace, orchestration_profile, trust_profile,
        created_at, last_opened_at, last_activity_at
      ) VALUES ('proj_01', 'Test', 'C:/test', 'active', '[]', 'm', 'mem', 'o', 'trusted', 'ts', 'ts', 'ts');
    `).run();

    // 2. Create session
    engine.raw.prepare(`
      INSERT INTO sessions (
        id, project_id, name, branch, status, model_profile,
        key_pool_profile, mode, permissions_json, created_at, updated_at
      ) VALUES ('sess_01', 'proj_01', 'Session 1', 'main', 'active', 'm', 'k', 'interactive', '{}', 'ts', 'ts');
    `).run();

    // 3. Create task
    engine.raw.prepare(`
      INSERT INTO tasks (
        id, project_id, session_id, objective, status, priority,
        dependencies_json, input_artifacts_json, output_artifacts_json,
        created_at, updated_at
      ) VALUES ('task_01', 'proj_01', 'sess_01', 'Obj', 'queued', 'normal', '[]', '[]', '[]', 'ts', 'ts');
    `).run();

    expect(engine.raw.prepare("SELECT COUNT(*) as count FROM sessions;").get()).toEqual({ count: 1 });
    expect(engine.raw.prepare("SELECT COUNT(*) as count FROM tasks;").get()).toEqual({ count: 1 });

    // 4. Delete project
    engine.raw.prepare("DELETE FROM projects WHERE id = 'proj_01';").run();

    // Verify cascaded deletion
    expect(engine.raw.prepare("SELECT COUNT(*) as count FROM projects;").get()).toEqual({ count: 0 });
    expect(engine.raw.prepare("SELECT COUNT(*) as count FROM sessions;").get()).toEqual({ count: 0 });
    expect(engine.raw.prepare("SELECT COUNT(*) as count FROM tasks;").get()).toEqual({ count: 0 });
  });
});
