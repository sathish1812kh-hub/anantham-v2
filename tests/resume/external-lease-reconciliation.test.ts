import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { ExternalLeaseReconciler } from "../../src/resume/external-lease-reconciler.js";

describe("F-REC-14: External Service Lease Reconciliation on Resume", () => {
  const testDir = join(process.cwd(), ".test_ext_lease_" + Date.now());
  const dbPath = join(testDir, "test.sqlite");
  let engine: SqliteEngine;
  let taskRepo: TaskRepository;
  let eventStore: EventStore;

  const sessionId = "sess_lease_01";
  const projectId = "prj_lease_01";

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    engine = new SqliteEngine({ path: dbPath });
    engine.open();

    const migrationEngine = new MigrationEngine(engine);
    migrationEngine.migrate();

    const now = new Date().toISOString();
    engine.raw.prepare(`
      INSERT INTO projects (id, name, root_path, status, tags_json, model_profile, memory_namespace, orchestration_profile, trust_profile, created_at, last_opened_at, last_activity_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `).run(projectId, "Lease Project", "/tmp/lease", "active", "[]", "default", "mem", "orch", "developer", now, now, now);

    engine.raw.prepare(`
      INSERT INTO sessions (id, project_id, name, branch, status, model_profile, key_pool_profile, mode, permissions_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `).run(sessionId, projectId, "Lease Session", "main", "active", "default", "default", "autonomous", "{}", now, now);

    taskRepo = new TaskRepository(engine);
    eventStore = new EventStore(engine);
  });

  afterEach(() => {
    if (engine.isOpen()) {
      engine.close();
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("reconciles healthy external MCP lease with incremented generation token", async () => {
    const reconciler = new ExternalLeaseReconciler({
      engine,
      taskRepo,
      eventStore,
      resourceProber: async () => ({ alive: true, renewable: true }),
    });

    reconciler.registerExternalLease({
      id: "ls_mcp_neo4j",
      leaseKind: "MCP_SERVER",
      targetResourceId: "mcp:neo4j",
      sessionId,
      generation: 1,
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      ttlMs: 60_000,
      status: "ACTIVE",
    });

    const report = await reconciler.reconcileSessionLeases(sessionId);
    expect(report.totalLeases).toBe(1);
    expect(report.renewedCount).toBe(1);
    expect(report.reconciliations[0].newGeneration).toBe(2);
    expect(report.reconciliations[0].status).toBe("RENEWED_VALID");

    const updated = reconciler.listLeases(sessionId);
    expect(updated[0].generation).toBe(2);
  });

  it("revokes unreachable external lease and marks dependent task as blocked", async () => {
    // Create a dependent task
    const taskId = "task_mcp_dep";
    const now = new Date().toISOString();
    taskRepo.save({
      id: taskId,
      projectId,
      sessionId,
      objective: "Query Neo4j knowledge graph",
      status: "running",
      priority: "normal",
      agentRole: "graph_specialist",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: now,
      updatedAt: now,
    });

    const reconciler = new ExternalLeaseReconciler({
      engine,
      taskRepo,
      eventStore,
      resourceProber: async () => ({ alive: false, renewable: false, error: "Connection refused on port 7687" }),
    });

    reconciler.registerExternalLease({
      id: "ls_mcp_unreachable",
      leaseKind: "MCP_SERVER",
      targetResourceId: "mcp:neo4j_unreachable",
      sessionId,
      taskId,
      generation: 3,
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      ttlMs: 60_000,
      status: "ACTIVE",
    });

    const report = await reconciler.reconcileSessionLeases(sessionId);
    expect(report.revokedCount).toBe(1);
    expect(report.reconciliations[0].status).toBe("REVOKED_UNREACHABLE");

    // Verify task transitioned to blocked
    const updatedTask = taskRepo.findById(taskId);
    expect(updatedTask?.status).toBe("blocked");
    expect(updatedTask?.metadata?.blockedReason).toContain("External resource lease unreachable");
  });

  it("handles key rotation during resume seamlessly updating credential references", async () => {
    const reconciler = new ExternalLeaseReconciler({
      engine,
      taskRepo,
      eventStore,
    });

    reconciler.registerExternalLease({
      id: "ls_openai_node",
      leaseKind: "REMOTE_EXECUTOR_NODE",
      targetResourceId: "node:openai_runner",
      sessionId,
      generation: 1,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      ttlMs: 60_000,
      status: "ACTIVE",
      credentialsRef: "cred_old_key_01",
    });

    const rotRes = await reconciler.handleKeyRotation(sessionId, "cred_old_key_01", "cred_new_rotated_key_02");
    expect(rotRes.updatedCount).toBe(1);

    const leases = reconciler.listLeases(sessionId);
    expect(leases[0].credentialsRef).toBe("cred_new_rotated_key_02");
  });
});
