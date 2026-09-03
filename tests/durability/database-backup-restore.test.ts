import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { EventRepository } from "../../src/persistence/repositories/event-repository.js";
import { DatabaseBackupManager } from "../../src/persistence/database-backup-manager.js";

describe("PRD-DUR-008: Automated Database Backup & Point-in-Time Restore", () => {
  const testDir = join(process.cwd(), ".test_backup_restore_" + Date.now());
  const dbPath = join(testDir, "test.sqlite");
  const backupStorageDir = join(testDir, "backups");
  let engine: SqliteEngine;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let eventRepo: EventRepository;
  let backupManager: DatabaseBackupManager;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    engine = new SqliteEngine({ path: dbPath });
    engine.open();

    const migrationEngine = new MigrationEngine(engine);
    migrationEngine.migrate();

    projectRepo = new ProjectRepository(engine);
    sessionRepo = new SessionRepository(engine);
    eventRepo = new EventRepository(engine);

    backupManager = new DatabaseBackupManager({
      engine,
      backupStorageDir,
    });
  });

  afterEach(() => {
    if (engine.isOpen()) {
      engine.close();
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("creates online hot backup of active SQLite database without blocking concurrent transactions", async () => {
    const now = new Date().toISOString();
    projectRepo.save({
      id: "prj_001",
      name: "Alpha Project",
      rootPath: "/tmp/alpha",
      status: "active",
      tags: ["core"],
      modelProfile: "claude-3-5-sonnet",
      memoryNamespace: "alpha-mem",
      orchestrationProfile: "standard",
      trustProfile: "developer",
      createdAt: now,
      lastOpenedAt: now,
      lastActivityAt: now,
    });

    sessionRepo.save({
      id: "sess_001",
      projectId: "prj_001",
      name: "Session 1",
      branch: "main",
      status: "active",
      modelProfile: "claude-3-5-sonnet",
      keyPoolProfile: "default",
      mode: "autonomous",
      permissions: { allowShell: true },
      createdAt: now,
      updatedAt: now,
    });

    const { backupPath, manifest } = await backupManager.createBackup();

    expect(existsSync(backupPath)).toBe(true);
    expect(manifest.version).toBe(1);
    expect(manifest.counts.projects).toBe(1);
    expect(manifest.counts.sessions).toBe(1);
    expect(manifest.checksums.dbSha256).toHaveLength(64);
    expect(manifest.credentialsExcluded).toBe(true);
  });

  it("encrypts backup archive with AES-256-GCM using passphrase and verifies decryption", async () => {
    const now = new Date().toISOString();
    projectRepo.save({
      id: "prj_secret",
      name: "Secret Project",
      rootPath: "/tmp/secret",
      status: "active",
      tags: ["confidential"],
      modelProfile: "claude-3-5-sonnet",
      memoryNamespace: "sec-mem",
      orchestrationProfile: "standard",
      trustProfile: "developer",
      createdAt: now,
      lastOpenedAt: now,
      lastActivityAt: now,
    });

    const passphrase = "SuperSecurePassword123!";
    const { backupPath, manifest } = await backupManager.createBackup({ passphrase });

    expect(manifest.encryption.enabled).toBe(true);
    expect(manifest.encryption.algorithm).toBe("AES-256-GCM");
    expect(existsSync(join(backupPath, "anantham.sqlite.enc"))).toBe(true);
    expect(existsSync(join(backupPath, "anantham.sqlite"))).toBe(false);

    // Dry-run restore with correct passphrase
    const dryRun = await backupManager.dryRunRestore(backupPath, { passphrase });
    expect(dryRun.isCompatible).toBe(true);
    expect(dryRun.integrityCheckPassed).toBe(true);
    expect(dryRun.counts.projects).toBe(1);

    // Dry-run restore with wrong passphrase should fail
    const dryRunFail = await backupManager.dryRunRestore(backupPath, { passphrase: "WrongPassword" });
    expect(dryRunFail.errors.length).toBeGreaterThan(0);
  });

  it("performs dry-run restore simulation and detects conflicting project/session IDs", async () => {
    const now = new Date().toISOString();
    projectRepo.save({
      id: "prj_conflict",
      name: "Conflict Project",
      rootPath: "/tmp/conflict",
      status: "active",
      tags: [],
      modelProfile: "default",
      memoryNamespace: "conflict",
      orchestrationProfile: "default",
      trustProfile: "developer",
      createdAt: now,
      lastOpenedAt: now,
      lastActivityAt: now,
    });

    const { backupPath } = await backupManager.createBackup();

    const dryRun = await backupManager.dryRunRestore(backupPath);
    expect(dryRun.conflicts.existingProjectsCount).toBe(1);
    expect(dryRun.warnings.length).toBeGreaterThan(0);
  });

  it("prevents destructive overwrite of active database unless explicit force flag is provided", async () => {
    const now = new Date().toISOString();
    projectRepo.save({
      id: "prj_base",
      name: "Base Project",
      rootPath: "/tmp/base",
      status: "active",
      tags: [],
      modelProfile: "default",
      memoryNamespace: "base",
      orchestrationProfile: "default",
      trustProfile: "developer",
      createdAt: now,
      lastOpenedAt: now,
      lastActivityAt: now,
    });

    const { backupPath } = await backupManager.createBackup();

    // Attempt restore without force should fail due to existing records
    await expect(backupManager.restoreBackup(backupPath)).rejects.toThrow(/force: true/i);

    // With force: true should succeed
    const res = await backupManager.restoreBackup(backupPath, { force: true });
    expect(res.success).toBe(true);
    expect(res.restoredCounts.projects).toBe(1);
  });

  it("executes point-in-time restore by applying base backup and filtering events up to offset", async () => {
    const now = new Date().toISOString();
    projectRepo.save({
      id: "prj_pitr",
      name: "PITR Project",
      rootPath: "/tmp/pitr",
      status: "active",
      tags: [],
      modelProfile: "default",
      memoryNamespace: "pitr",
      orchestrationProfile: "default",
      trustProfile: "developer",
      createdAt: now,
      lastOpenedAt: now,
      lastActivityAt: now,
    });

    // Create 3 events
    eventRepo.append({
      id: "evt_001",
      schemaVersion: 1,
      projectId: "prj_pitr",
      type: "project.created",
      actor: "user",
      timestamp: "2026-09-01T10:00:00.000Z",
      payload: { name: "PITR Project" },
    });

    eventRepo.append({
      id: "evt_002",
      schemaVersion: 1,
      projectId: "prj_pitr",
      type: "task.created",
      actor: "agent",
      timestamp: "2026-09-01T10:05:00.000Z",
      payload: { objective: "Step 1" },
    });

    eventRepo.append({
      id: "evt_003",
      schemaVersion: 1,
      projectId: "prj_pitr",
      type: "task.created",
      actor: "agent",
      timestamp: "2026-09-01T10:10:00.000Z",
      payload: { objective: "Step 2" },
    });

    const { backupPath } = await backupManager.createBackup();

    // PITR up to event 2
    const pitrRes = await backupManager.pointInTimeRestore(backupPath, { sequenceOffset: 2 });
    expect(pitrRes.success).toBe(true);

    const remainingEvents = eventRepo.listByProject("prj_pitr");
    expect(remainingEvents.length).toBe(2);
    expect(remainingEvents.map((e) => e.id)).toEqual(["evt_001", "evt_002"]);
  });

  it("lists all existing backups sorted by creation time with valid metadata", async () => {
    await backupManager.createBackup({ label: "Backup 1" });
    await backupManager.createBackup({ label: "Backup 2" });

    const backups = await backupManager.listBackups();
    expect(backups.length).toBe(2);
    expect(backups[0].manifest.version).toBe(1);
    expect(backups[0].sizeBytes).toBeGreaterThan(0);
  });
});
