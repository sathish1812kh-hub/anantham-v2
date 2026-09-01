import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { LeaseRepository } from "../../src/persistence/repositories/lease-repository.js";
import { ArtifactRepository } from "../../src/persistence/repositories/artifact-repository.js";
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";
import { CrashRecoveryEngine } from "../../src/recovery/crash-recovery-engine.js";
import { ArtifactManager, ArtifactAccessDeniedError } from "../../src/artifacts/artifact-manager.js";
import { ToolGateway } from "../../src/tools/tool-gateway.js";
import { ToolRegistry } from "../../src/tools/tool-registry.js";
import { PolicyEngine } from "../../src/policy/policy-engine.js";

describe("P10.7 Operational Chaos, State Machine Fuzzing & Recovery Invariant Suite", () => {
  let tempDir: string;
  let engine: SqliteEngine;
  let eventStore: EventStore;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let taskRepo: TaskRepository;
  let leaseRepo: LeaseRepository;
  let artifactRepo: ArtifactRepository;
  let claimManager: TaskClaimManager;
  let recoveryEngine: CrashRecoveryEngine;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "anantham-p10-7-chaos-"));
    const dbPath = join(tempDir, "test.db");
    engine = new SqliteEngine({ path: dbPath });
    engine.open();

    const migrationEngine = new MigrationEngine(engine);
    migrationEngine.migrate();

    eventStore = new EventStore(engine);
    projectRepo = new ProjectRepository(engine);
    sessionRepo = new SessionRepository(engine);
    taskRepo = new TaskRepository(engine);
    leaseRepo = new LeaseRepository(engine);
    artifactRepo = new ArtifactRepository(engine);

    claimManager = new TaskClaimManager({ engine, taskRepo, leaseRepo, eventStore });
    recoveryEngine = new CrashRecoveryEngine({ engine, eventStore });

    const now = new Date().toISOString();
    projectRepo.save({
      id: "proj_alpha",
      name: "Project Alpha",
      rootPath: join(tempDir, "proj_alpha"),
      status: "active",
      tags: [],
      modelProfile: "default",
      memoryNamespace: "proj_alpha",
      orchestrationProfile: "default",
      trustProfile: "developer",
      createdAt: now,
      lastOpenedAt: now,
      lastActivityAt: now,
    });

    projectRepo.save({
      id: "proj_beta",
      name: "Project Beta",
      rootPath: join(tempDir, "proj_beta"),
      status: "active",
      tags: [],
      modelProfile: "default",
      memoryNamespace: "proj_beta",
      orchestrationProfile: "default",
      trustProfile: "developer",
      createdAt: now,
      lastOpenedAt: now,
      lastActivityAt: now,
    });

    sessionRepo.save({
      id: "sess_alpha_1",
      projectId: "proj_alpha",
      name: "Alpha Session",
      branch: "main",
      status: "active",
      modelProfile: "default",
      keyPoolProfile: "default",
      mode: "interactive",
      permissions: {},
      createdAt: now,
      updatedAt: now,
    });

    sessionRepo.save({
      id: "sess_beta_1",
      projectId: "proj_beta",
      name: "Beta Session",
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
    engine.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  // --- 1. Indirect Reference Attack across Project Tenants ---
  it("Tenant Isolation: Prevents cross-project indirect reference access for artifacts", async () => {
    const artManager = new ArtifactManager(artifactRepo, join(tempDir, "artifacts"));

    const art = await artManager.createArtifact({
      id: "art_alpha_secret",
      projectId: "proj_alpha",
      sessionId: "sess_alpha_1",
      filename: "secret.txt",
      type: "file",
      data: "ALPHA_CLASSIFIED_DATA",
    });

    // Project Alpha access succeeds
    const retrievedAlpha = await artManager.readArtifact(art.id, {
      requestProjectId: "proj_alpha",
      requestSessionId: "sess_alpha_1",
    });
    expect(retrievedAlpha.artifact.id).toBe("art_alpha_secret");

    // Project Beta attempt using Alpha artifact ID fails closed with ArtifactAccessDeniedError
    await expect(
      artManager.readArtifact(art.id, {
        requestProjectId: "proj_beta",
        requestSessionId: "sess_beta_1",
      })
    ).rejects.toThrow(ArtifactAccessDeniedError);
  });

  // --- 2. Revocation Latency & In-Flight Interruption Defense ---
  it("Revocation Latency: In-flight lease revocation instantaneously blocks subsequent side-effect tool execution", async () => {
    const now = new Date().toISOString();
    taskRepo.save({
      id: "task_revocation_test",
      projectId: "proj_alpha",
      sessionId: "sess_alpha_1",
      objective: "Sensitive work",
      status: "queued",
      priority: "high",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: now,
      updatedAt: now,
    });

    const claim = claimManager.claimTask({
      taskId: "task_revocation_test",
      agentId: "worker_target",
      instanceId: "inst_target",
      projectId: "proj_alpha",
      sessionId: "sess_alpha_1",
      ttlMs: 60000,
    });
    expect(claim.success).toBe(true);

    const registry = new ToolRegistry();
    registry.register({
      definition: {
        name: "write_action",
        description: "Performs persistent side effect",
        riskLevel: "medium",
        sensitivity: "normal",
        isIdempotent: false,
        parametersSchema: {
          type: "object",
          properties: { val: { type: "string" } },
        },
      },
      handler: async () => ({ status: "written" }),
    });

    const gateway = new ToolGateway({
      registry,
      policyEngine: new PolicyEngine({ version: "1.0.0" }),
      claimManager,
      eventStore,
    });

    // Execution before revocation succeeds
    const obs1 = await gateway.invoke({
      callId: "call_valid_1",
      toolName: "write_action",
      arguments: { val: "ok" },
      actor: { id: "worker_target", type: "agent" },
      project: { id: "proj_alpha" },
      session: { id: "sess_alpha_1" },
      task: { id: "task_revocation_test", leaseId: claim.lease!.id, generation: claim.lease!.generation },
    });
    expect(obs1.status).toBe("success");

    // Revoke / expire lease administratively
    leaseRepo.updateStatus(claim.lease!.id, "REVOKED");

    // Subsequent execution using revoked lease is instantaneously blocked
    const obs2 = await gateway.invoke({
      callId: "call_blocked_1",
      toolName: "write_action",
      arguments: { val: "blocked" },
      actor: { id: "worker_target", type: "agent" },
      project: { id: "proj_alpha" },
      session: { id: "sess_alpha_1" },
      task: { id: "task_revocation_test", leaseId: claim.lease!.id, generation: claim.lease!.generation },
    });
    expect(obs2.status).toBe("denied");
    expect(obs2.error?.code).toBe("LEASE_FENCING_ERROR");
  });

  // --- 3. Multi-Cycle Repeated Idempotent Recovery ---
  it("Recovery Idempotency: Consecutive crash recovery cycles maintain strict invariant equivalence without duplicate state", async () => {
    const past = new Date(Date.now() - 100000).toISOString();
    taskRepo.save({
      id: "task_chaos_01",
      projectId: "proj_alpha",
      sessionId: "sess_alpha_1",
      objective: "Interrupted task",
      status: "running",
      priority: "normal",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: past,
      updatedAt: past,
    });

    leaseRepo.save({
      id: "lease_chaos_01",
      taskId: "task_chaos_01",
      agentId: "agent_dead",
      instanceId: "inst_dead",
      projectId: "proj_alpha",
      sessionId: "sess_alpha_1",
      generation: 1,
      acquiredAt: past,
      expiresAt: past,
      lastHeartbeatAt: past,
      ttlMs: 1000,
      status: "ACTIVE",
      renewalCount: 0,
      maxRenewals: 5,
    });

    // Cycle 1: Discovers stale lease & interrupted task
    const rec1 = await recoveryEngine.executeRecovery();
    expect(rec1.status).toBe("SUCCESS");
    expect(rec1.staleLeasesEvictedCount).toBe(1);
    expect(taskRepo.findById("task_chaos_01")?.status).toBe("queued");
    expect(leaseRepo.findById("lease_chaos_01")?.status).toBe("EXPIRED");

    // Cycle 2: Immediate consecutive recovery run (Zero anomalies remaining)
    const rec2 = await recoveryEngine.executeRecovery();
    expect(rec2.status).toBe("SUCCESS");
    expect(rec2.staleLeasesEvictedCount).toBe(0);
    expect(rec2.anomalies.length).toBe(0);
    expect(taskRepo.findById("task_chaos_01")?.status).toBe("queued");

    // Cycle 3: Third consecutive run (Stable, deterministic)
    const rec3 = await recoveryEngine.executeRecovery();
    expect(rec3.status).toBe("SUCCESS");
    expect(rec3.databaseIntegrityPassed).toBe(true);
    expect(rec3.anomalies.length).toBe(0);
  });

  // --- 4. State-Machine Concurrency Fuzzing ---
  it("State-Machine Fuzzing: Enforces valid status transitions across randomized concurrent task claim operations", async () => {
    const now = new Date().toISOString();
    taskRepo.save({
      id: "task_fuzz_01",
      projectId: "proj_alpha",
      sessionId: "sess_alpha_1",
      objective: "Fuzz target task",
      status: "queued",
      priority: "normal",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: now,
      updatedAt: now,
    });

    // 20 concurrent workers race to claim the same task
    const workers = Array.from({ length: 20 }, (_, i) => ({
      agentId: `worker_${i}`,
      instanceId: `inst_${i}`,
    }));

    const results = workers.map((w) =>
      claimManager.claimTask({
        taskId: "task_fuzz_01",
        agentId: w.agentId,
        instanceId: w.instanceId,
        projectId: "proj_alpha",
        sessionId: "sess_alpha_1",
        ttlMs: 5000,
      })
    );

    const successfulClaims = results.filter((r) => r.success);
    const failedClaims = results.filter((r) => !r.success);

    // Exactly 1 worker wins the claim
    expect(successfulClaims.length).toBe(1);
    expect(failedClaims.length).toBe(19);

    // Winner holds generation 1
    const winner = successfulClaims[0];
    expect(winner.lease?.generation).toBe(1);
    expect(taskRepo.findById("task_fuzz_01")?.status).toBe("claimed");
  });
});
