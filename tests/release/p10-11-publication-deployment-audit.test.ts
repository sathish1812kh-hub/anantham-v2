import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { LeaseRepository } from "../../src/persistence/repositories/lease-repository.js";
import { CrashRecoveryEngine } from "../../src/recovery/crash-recovery-engine.js";
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";
import { EventTypes } from "../../src/domain/event.js";

describe("P10.11 Final Publication, Deployment, Rollback & Recovery Audit Suite", () => {
  let tempDir: string;
  let engine: SqliteEngine;
  let eventStore: EventStore;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let taskRepo: TaskRepository;
  let leaseRepo: LeaseRepository;
  let claimManager: TaskClaimManager;
  let recoveryEngine: CrashRecoveryEngine;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "anantham-p10-11-audit-"));
    const dbPath = join(tempDir, "production.db");
    engine = new SqliteEngine({ path: dbPath });
    engine.open();

    const migrationEngine = new MigrationEngine(engine);
    migrationEngine.migrate();

    eventStore = new EventStore(engine);
    projectRepo = new ProjectRepository(engine);
    sessionRepo = new SessionRepository(engine);
    taskRepo = new TaskRepository(engine);
    leaseRepo = new LeaseRepository(engine);

    claimManager = new TaskClaimManager({ engine, taskRepo, leaseRepo, eventStore });
    recoveryEngine = new CrashRecoveryEngine({ engine, eventStore });

    const now = new Date().toISOString();
    projectRepo.save({
      id: "proj_prod",
      name: "Production Certified Project",
      rootPath: join(tempDir, "proj_prod"),
      status: "active",
      tags: ["production"],
      modelProfile: "default",
      memoryNamespace: "proj_prod",
      orchestrationProfile: "default",
      trustProfile: "developer",
      createdAt: now,
      lastOpenedAt: now,
      lastActivityAt: now,
    });

    sessionRepo.save({
      id: "sess_prod",
      projectId: "proj_prod",
      name: "Production Session",
      branch: "main",
      status: "active",
      modelProfile: "default",
      keyPoolProfile: "default",
      mode: "interactive",
      permissions: {},
      createdAt: now,
      updatedAt: now,
    });
  });

  afterEach(() => {
    if (engine.isOpen()) {
      engine.close();
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  // --- 1. End-to-End Pipeline Boundary: Active Workload -> Hot Backup -> Crash -> Restore -> Recovery ---
  it("End-to-End Release Pipeline: Hot backup during active workload restores cleanly with zero data loss", async () => {
    const now = new Date().toISOString();

    // 1. Create active task and claim lease
    taskRepo.save({
      id: "task_pipeline_1",
      projectId: "proj_prod",
      sessionId: "sess_prod",
      objective: "Pipeline test task",
      status: "running",
      priority: "critical",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: now,
      updatedAt: now,
    });

    const past = new Date(Date.now() - 60000).toISOString();
    leaseRepo.save({
      id: "lease_pipeline_1",
      taskId: "task_pipeline_1",
      agentId: "agent_prod_1",
      instanceId: "inst_prod_1",
      projectId: "proj_prod",
      sessionId: "sess_prod",
      generation: 1,
      acquiredAt: past,
      expiresAt: past, // Expired lease
      lastHeartbeatAt: past,
      ttlMs: 5000,
      status: "ACTIVE",
      renewalCount: 0,
      maxRenewals: 3,
    });

    // 2. Perform live online hot backup
    const backupPath = join(tempDir, "prod-backup.db");
    engine.backup(backupPath);
    expect(existsSync(backupPath)).toBe(true);

    // 3. Simulate process crash by closing active engine
    engine.close();

    // 4. Restore backup into a new isolated database instance
    const restoredEngine = new SqliteEngine({ path: backupPath });
    restoredEngine.open();

    const integrity = restoredEngine.integrityCheck();
    expect(integrity.ok).toBe(true);

    const fkCheck = restoredEngine.foreignKeyCheck();
    expect(fkCheck.ok).toBe(true);

    // 5. Execute crash recovery on restored database
    const restoredEventStore = new EventStore(restoredEngine);
    const restoredRecoveryEngine = new CrashRecoveryEngine({
      engine: restoredEngine,
      eventStore: restoredEventStore,
    });

    const recoveryResult = await restoredRecoveryEngine.executeRecovery();
    expect(recoveryResult.status).toBe("SUCCESS");
    expect(recoveryResult.staleLeasesEvictedCount).toBe(1);

    const restoredTaskRepo = new TaskRepository(restoredEngine);
    const taskAfter = restoredTaskRepo.findById("task_pipeline_1");
    expect(taskAfter?.status).toBe("queued");

    restoredEngine.close();
  });

  // --- 2. Operational Rollback: Backup-Before-Migration Recovery ---
  it("Operational Rollback: Restores pre-migration backup cleanly if forward migration fails", () => {
    const preMigrationBackup = join(tempDir, "pre-migration-backup.db");

    // Take backup before applying change
    engine.backup(preMigrationBackup);
    expect(existsSync(preMigrationBackup)).toBe(true);

    // Simulate failed in-place modification
    try {
      engine.transaction(() => {
        engine.raw.exec("CREATE TABLE simulated_failing_table (id TEXT PRIMARY KEY);");
        throw new Error("Simulated migration failure mid-transaction");
      });
    } catch (err: any) {
      expect(err.message).toContain("Simulated migration failure");
    }

    // Verify original database rolled back cleanly
    const integrity = engine.integrityCheck();
    expect(integrity.ok).toBe(true);

    // Verify backup database remains pristine
    const backupEngine = new SqliteEngine({ path: preMigrationBackup });
    backupEngine.open();
    expect(backupEngine.integrityCheck().ok).toBe(true);
    expect(backupEngine.foreignKeyCheck().ok).toBe(true);
    backupEngine.close();
  });

  // --- 3. Release Package Cryptographic Provenance ---
  it("Release Provenance: Tarball SHA-256 matches release manifest exactly", () => {
    const manifestPath = join(process.cwd(), "dist/release/release-manifest.json");
    expect(existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    expect(manifest.name).toBe("anantham-v2");
    expect(manifest.version).toBe("2.0.0-alpha.1");
    expect(manifest.reproducible).toBe(true);
    expect(manifest.runtimeDependencies).toEqual(["zod"]);

    const tarballPath = join(process.cwd(), "dist/release", manifest.filename);
    expect(existsSync(tarballPath)).toBe(true);

    const tarballBuf = readFileSync(tarballPath);
    const computedSha256 = createHash("sha256").update(tarballBuf).digest("hex");
    expect(computedSha256).toBe(manifest.sha256);
  });
});
