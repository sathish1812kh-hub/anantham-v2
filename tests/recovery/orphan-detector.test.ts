import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { OrphanDetector } from "../../src/recovery/orphan-detector.js";

describe("Recovery Subsystem — OrphanDetector", () => {
  let tmpDir: string;
  let dbPath: string;
  let engine: SqliteEngine;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let detector: OrphanDetector;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "anantham-orphan-test-"));
    dbPath = join(tmpDir, "orphan-test.db");
    engine = new SqliteEngine({ path: dbPath });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    projectRepo = new ProjectRepository(engine);
    sessionRepo = new SessionRepository(engine);
    detector = new OrphanDetector(engine);

    projectRepo.save({
      id: "proj_orph_01",
      name: "Orphan Test Project",
      rootPath: "/tmp/proj",
      status: "active",
      tags: ["testing"],
      modelProfile: "claude-3-5-sonnet",
      memoryNamespace: "project/proj_orph_01",
      orchestrationProfile: "default",
      trustProfile: "developer",
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    });

    sessionRepo.save({
      id: "sess_orph_01",
      projectId: "proj_orph_01",
      name: "Orphan Test Session",
      branch: "main",
      status: "active",
      modelProfile: "claude-3-5-sonnet",
      keyPoolProfile: "default",
      mode: "interactive",
      permissions: { "filesystem:read": true },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  afterEach(() => {
    engine.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reports 0 orphans when all entities have valid referential integrity", () => {
    const report = detector.detectOrphans();
    expect(report.totalOrphansCount).toBe(0);
    expect(report.anomalies).toHaveLength(0);
  });

  it("detects orphan sessions when parentSessionId points to non-existent session", () => {
    // Insert child session with non-existent parent directly (temporarily disabling foreign_keys for corruption test)
    engine.raw.exec("PRAGMA foreign_keys = OFF;");
    engine.raw.prepare(`
      INSERT INTO sessions (id, project_id, name, branch, parent_session_id, status, model_profile, key_pool_profile, mode, permissions_json, created_at, updated_at)
      VALUES ('sess_corrupt_child', 'proj_orph_01', 'Corrupt Child', 'main', 'non_existent_parent', 'active', 'claude-3-5-sonnet', 'default', 'interactive', '{}', '2026-08-30T00:00:00Z', '2026-08-30T00:00:00Z');
    `).run();
    engine.raw.exec("PRAGMA foreign_keys = ON;");

    const report = detector.detectOrphans();
    expect(report.orphanSessions).toContain("sess_corrupt_child");
    expect(report.totalOrphansCount).toBeGreaterThan(0);
    expect(report.anomalies.some((a) => a.type === "INTEGRITY_VIOLATION")).toBe(true);
  });

  it("detects orphan artifacts and checkpoints when session is missing", () => {
    engine.raw.exec("PRAGMA foreign_keys = OFF;");
    engine.raw.prepare(`
      INSERT INTO artifacts (id, type, project_id, session_id, content_uri, sha256, source_event_ids_json, created_at)
      VALUES ('art_ghost_01', 'generated-file', 'proj_orph_01', 'non_existent_sess', 'file:///tmp/o.txt', '${"f".repeat(64)}', '[]', '2026-08-30T00:00:00Z');
    `).run();

    engine.raw.prepare(`
      INSERT INTO checkpoints (id, type, project_id, session_id, manifest_json, sha256, created_at, validation_checksum)
      VALUES ('chk_ghost_01', 'automatic', 'proj_orph_01', 'non_existent_sess', '{}', '${"0".repeat(64)}', '2026-08-30T00:00:00Z', 'chk_sum');
    `).run();
    engine.raw.exec("PRAGMA foreign_keys = ON;");

    const report = detector.detectOrphans();
    expect(report.orphanArtifacts).toContain("art_ghost_01");
    expect(report.orphanCheckpoints).toContain("chk_ghost_01");
    expect(report.anomalies.some((a) => a.type === "ORPHAN_ARTIFACT")).toBe(true);
    expect(report.anomalies.some((a) => a.type === "CORRUPTED_CHECKPOINT")).toBe(true);
  });
});
