import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TuiStateAdapter } from "../../src/tui/tui-state-adapter.js";
import { TuiRenderer } from "../../src/tui/tui-renderer.js";

describe("P8.2 TUI — Recovery State Visibility", () => {
  let engine: SqliteEngine;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let adapter: TuiStateAdapter;
  let renderer: TuiRenderer;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    projectRepo = new ProjectRepository(engine);
    sessionRepo = new SessionRepository(engine);

    adapter = new TuiStateAdapter({ projectRepo, sessionRepo });
    renderer = new TuiRenderer();
  });

  afterEach(() => {
    adapter.destroy();
    engine.close();
  });

  it("reflects RECOVERING, RECOVERED, and NORMAL state in status bar", () => {
    adapter.setStatus("NORMAL");
    let out = renderer.render("dashboard", adapter);
    expect(out).toContain("Status: [NORMAL]");

    adapter.setStatus("RECOVERING");
    out = renderer.render("dashboard", adapter);
    expect(out).toContain("Status: [RECOVERING]");

    adapter.setStatus("RECOVERED");
    out = renderer.render("dashboard", adapter);
    expect(out).toContain("Status: [RECOVERED]");
  });
});
