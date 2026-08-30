import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { LeaseManager } from "../../src/recovery/lease-manager.js";

describe("Recovery Subsystem — LeaseManager", () => {
  let tmpDir: string;
  let dbPath: string;
  let engine: SqliteEngine;
  let taskRepo: TaskRepository;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "anantham-lease-test-"));
    dbPath = join(tmpDir, "lease-test.db");
    engine = new SqliteEngine({ path: dbPath });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    taskRepo = new TaskRepository(engine);
    projectRepo = new ProjectRepository(engine);
    sessionRepo = new SessionRepository(engine);

    projectRepo.save({
      id: "proj_lease_01",
      name: "Lease Test Project",
      rootPath: "/tmp/proj",
      status: "active",
      tags: ["testing"],
      modelProfile: "claude-3-5-sonnet",
      memoryNamespace: "project/proj_lease_01",
      orchestrationProfile: "default",
      trustProfile: "developer",
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    });

    sessionRepo.save({
      id: "sess_lease_01",
      projectId: "proj_lease_01",
      name: "Lease Test Session",
      branch: "main",
      status: "active",
      modelProfile: "claude-3-5-sonnet",
      keyPoolProfile: "default",
      mode: "interactive",
      permissions: { "filesystem:read": true },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    taskRepo.save({
      id: "tsk_lease_01",
      projectId: "proj_lease_01",
      sessionId: "sess_lease_01",
      objective: "Run test task",
      status: "queued",
      priority: "normal",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  afterEach(() => {
    engine.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("acquires an exclusive lease and prevents duplicate claims", () => {
    const leaseManager = new LeaseManager({ taskRepo });

    const claim1 = leaseManager.acquireLease("tsk_lease_01", "agent_worker_1", 10_000);
    expect(claim1.success).toBe(true);
    expect(claim1.lease).toBeDefined();
    expect(claim1.lease?.status).toBe("ACTIVE");

    // Second agent attempts to claim the same task
    const claim2 = leaseManager.acquireLease("tsk_lease_01", "agent_worker_2", 10_000);
    expect(claim2.success).toBe(false);
    expect(claim2.reason).toContain("actively leased to agent 'agent_worker_1'");
  });

  it("allows re-entrant lease renewal and heartbeat extension by the same agent", () => {
    const leaseManager = new LeaseManager({ taskRepo });

    const claim = leaseManager.acquireLease("tsk_lease_01", "agent_worker_1", 5_000);
    expect(claim.success).toBe(true);
    const initialExpiry = claim.lease!.expiresAt;

    // Heartbeat extension
    const hb = leaseManager.heartbeat(claim.lease!.leaseId, 15_000);
    expect(hb.success).toBe(true);
    expect(hb.lease!.expiresAt).toBeGreaterThan(initialExpiry);
  });

  it("releases a lease cleanly", () => {
    const leaseManager = new LeaseManager({ taskRepo });

    const claim = leaseManager.acquireLease("tsk_lease_01", "agent_worker_1", 10_000);
    expect(claim.success).toBe(true);

    const released = leaseManager.releaseLease(claim.lease!.leaseId);
    expect(released).toBe(true);
    expect(leaseManager.getActiveLease("tsk_lease_01")).toBeNull();

    // Another agent can now claim it
    const claim2 = leaseManager.acquireLease("tsk_lease_01", "agent_worker_2", 10_000);
    expect(claim2.success).toBe(true);
  });

  it("automatically detects and evicts expired leases during stale lease sweep", async () => {
    const leaseManager = new LeaseManager({ taskRepo, defaultTtlMs: 50 });

    // Transition task to claimed, then running
    taskRepo.updateStatus("tsk_lease_01", "claimed");
    taskRepo.updateStatus("tsk_lease_01", "running");

    const claim = leaseManager.acquireLease("tsk_lease_01", "agent_worker_1", 50); // 50ms TTL
    expect(claim.success).toBe(true);

    // Wait 70ms for expiration
    await new Promise((resolve) => setTimeout(resolve, 70));

    // Stale lease sweep
    const result = leaseManager.reclaimStaleLeases();
    expect(result.evictedCount).toBe(1);
    expect(result.evictedLeases[0].leaseId).toBe(claim.lease!.leaseId);
    expect(result.evictedLeases[0].status).toBe("EXPIRED");

    // Verify task status was reset back to queued for recovery
    const task = taskRepo.findById("tsk_lease_01");
    expect(task?.status).toBe("queued");
  });
});
