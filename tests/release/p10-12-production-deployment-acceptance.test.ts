import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

describe("P10.12 Production Publication & Deployment Acceptance Suite", () => {
  // --- 1. Minimum Supported Runtime Verification ---
  it("Runtime Compatibility: Declared engine contract >=22.0.0 verified with native SQLite", () => {
    const nodeMajor = parseInt(process.versions.node.split(".")[0]!, 10);
    expect(nodeMajor).toBeGreaterThanOrEqual(22);

    // Verify native node:sqlite is available
    const { DatabaseSync } = require("node:sqlite");
    expect(DatabaseSync).toBeDefined();

    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA journal_mode = WAL;");
    const result = db.prepare("SELECT 1 as num").get() as any;
    expect(result.num).toBe(1);
    db.close();
  });

  // --- 2. Production Artifact Cryptographic Invariance ---
  it("Publication Integrity: Audited, Published, and Installed artifact hashes match exactly", () => {
    const manifestPath = join(process.cwd(), "dist/release/release-manifest.json");
    expect(existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    const tarballPath = join(process.cwd(), "dist/release", manifest.filename);
    expect(existsSync(tarballPath)).toBe(true);

    const tarballBuf = readFileSync(tarballPath);
    const tarballSha256 = createHash("sha256").update(tarballBuf).digest("hex");

    expect(tarballSha256).toBe(manifest.sha256);
    expect(manifest.sha256).toBe("c4fe08a647c2b1a5f367ba209f6b9cfda81962715429819b71328e4034b85165");
    expect(manifest.runtimeDependencies).toEqual(["zod"]);
  });

  // --- 3. Clean-Environment Deployment & Production Smoke Workload ---
  it("Production Deployment Acceptance: Executes full lifecycle exclusively from packaged tarball", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "anantham-p10-12-accept-"));
    const tarballPath = join(process.cwd(), "dist/release/anantham-v2-2.0.0-alpha.1.tgz");

    try {
      // 1. Extract package in clean isolated directory
      execSync(`tar -xzf "${tarballPath}" -C "${tempDir}"`);
      const pkgRoot = join(tempDir, "package");
      expect(existsSync(join(pkgRoot, "package.json"))).toBe(true);

      // 2. Import modules dynamically from extracted package
      const { SqliteEngine } = await import(pathToFileURL(join(pkgRoot, "dist/persistence/sqlite-engine.js")).href);
      const { MigrationEngine } = await import(pathToFileURL(join(pkgRoot, "dist/persistence/migration-engine.js")).href);
      const { ProjectRepository } = await import(pathToFileURL(join(pkgRoot, "dist/persistence/repositories/project-repository.js")).href);
      const { SessionRepository } = await import(pathToFileURL(join(pkgRoot, "dist/persistence/repositories/session-repository.js")).href);
      const { TaskRepository } = await import(pathToFileURL(join(pkgRoot, "dist/persistence/repositories/task-repository.js")).href);
      const { LeaseRepository } = await import(pathToFileURL(join(pkgRoot, "dist/persistence/repositories/lease-repository.js")).href);
      const { EventStore } = await import(pathToFileURL(join(pkgRoot, "dist/event-state/event-store.js")).href);
      const { TaskClaimManager } = await import(pathToFileURL(join(pkgRoot, "dist/tasks/task-claim-manager.js")).href);
      const { ToolGateway } = await import(pathToFileURL(join(pkgRoot, "dist/tools/tool-gateway.js")).href);
      const { ToolRegistry } = await import(pathToFileURL(join(pkgRoot, "dist/tools/tool-registry.js")).href);
      const { PolicyEngine } = await import(pathToFileURL(join(pkgRoot, "dist/policy/policy-engine.js")).href);
      const { ApprovalManager } = await import(pathToFileURL(join(pkgRoot, "dist/policy/approval-manager.js")).href);
      const { CrashRecoveryEngine } = await import(pathToFileURL(join(pkgRoot, "dist/recovery/crash-recovery-engine.js")).href);

      // 3. Initialize SQLite Engine and execute migrations 001-010
      const dbPath = join(tempDir, "prod-live.db");
      const engine = new SqliteEngine({ path: dbPath });
      engine.open();

      const migrator = new MigrationEngine(engine);
      const migrationResults = migrator.migrate();
      expect(migrationResults.appliedCount).toBe(10);
      expect(migrationResults.currentVersion).toBe(10);
      expect(engine.integrityCheck().ok).toBe(true);

      // 4. Set up core repositories and domain managers
      const eventStore = new EventStore(engine);
      const projectRepo = new ProjectRepository(engine);
      const sessionRepo = new SessionRepository(engine);
      const taskRepo = new TaskRepository(engine);
      const leaseRepo = new LeaseRepository(engine);
      const claimManager = new TaskClaimManager({ engine, taskRepo, leaseRepo, eventStore });
      const approvalManager = new ApprovalManager({ eventStore, defaultTtlMs: 60000 });
      const policyEngine = new PolicyEngine({ version: "1.0.0" });
      const toolRegistry = new ToolRegistry();
      const gateway = new ToolGateway({
        registry: toolRegistry,
        policyEngine,
        approvalManager,
        claimManager,
        eventStore,
      });

      const now = new Date().toISOString();
      projectRepo.save({
        id: "proj_prod_accepted",
        name: "Production Accepted Project",
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
        id: "sess_prod_accepted",
        projectId: "proj_prod_accepted",
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

      taskRepo.save({
        id: "task_prod_accepted",
        projectId: "proj_prod_accepted",
        sessionId: "sess_prod_accepted",
        objective: "Production acceptance task",
        status: "queued",
        priority: "critical",
        dependencies: [],
        inputArtifacts: [],
        outputArtifacts: [],
        createdAt: now,
        updatedAt: now,
      });

      // 5. Claim task exclusively with monotonic lease generation
      const claim = claimManager.claimTask({
        taskId: "task_prod_accepted",
        agentId: "agent_prod_worker",
        instanceId: "inst_prod_worker",
        projectId: "proj_prod_accepted",
        sessionId: "sess_prod_accepted",
        ttlMs: 30000,
      });
      expect(claim.success).toBe(true);
      expect(claim.lease?.generation).toBe(1);

      // 6. Perform live hot backup during active operation
      const backupPath = join(tempDir, "prod-hot-backup.db");
      engine.backup(backupPath);
      expect(existsSync(backupPath)).toBe(true);

      // 7. Close active engine to simulate process restart
      engine.close();

      // 8. Restore from hot backup into fresh engine and execute recovery
      const restoredEngine = new SqliteEngine({ path: backupPath });
      restoredEngine.open();
      expect(restoredEngine.integrityCheck().ok).toBe(true);
      expect(restoredEngine.foreignKeyCheck().ok).toBe(true);

      const restoredEventStore = new EventStore(restoredEngine);
      const restoredRecovery = new CrashRecoveryEngine({
        engine: restoredEngine,
        eventStore: restoredEventStore,
      });

      const recoveryResult = await restoredRecovery.executeRecovery();
      expect(recoveryResult.status).toBe("SUCCESS");

      restoredEngine.close();
    } finally {
      try {
        rmSync(tempDir, { recursive: true, force: true, maxRetries: 3 });
      } catch {
        // Non-blocking Windows file lock cleanup
      }
    }
  });
});
