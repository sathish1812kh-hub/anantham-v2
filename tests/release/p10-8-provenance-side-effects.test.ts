import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { LeaseRepository } from "../../src/persistence/repositories/lease-repository.js";
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";
import { ApprovalManager } from "../../src/policy/approval-manager.js";
import { PolicyEngine } from "../../src/policy/policy-engine.js";
import { ToolGateway } from "../../src/tools/tool-gateway.js";
import { ToolRegistry } from "../../src/tools/tool-registry.js";
import { CommandRegistry } from "../../src/cli/command-registry.js";
import { SessionController } from "../../src/cli/session-controller.js";

describe("P10.8 Release Provenance, External Side-Effect & Invariant Audit Suite", () => {
  let tempDir: string;
  let engine: SqliteEngine;
  let eventStore: EventStore;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let taskRepo: TaskRepository;
  let leaseRepo: LeaseRepository;
  let claimManager: TaskClaimManager;
  let approvalManager: ApprovalManager;
  let policyEngine: PolicyEngine;
  let registry: ToolRegistry;
  let gateway: ToolGateway;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "anantham-p10-8-audit-"));
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

    claimManager = new TaskClaimManager({ engine, taskRepo, leaseRepo, eventStore });
    approvalManager = new ApprovalManager({ eventStore, defaultTtlMs: 60000 });
    policyEngine = new PolicyEngine({ version: "1.0.0" });
    registry = new ToolRegistry();

    gateway = new ToolGateway({
      registry,
      policyEngine,
      approvalManager,
      claimManager,
      eventStore,
    });
  });

  afterEach(() => {
    engine.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  // --- 1. Release Manifest & Cryptographic Hash Verification ---
  it("Release Provenance: Tarball matches manifest SHA-256 and SHA-512 hashes", () => {
    const manifestPath = join(process.cwd(), "dist/release/release-manifest.json");
    expect(existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const tarballPath = join(process.cwd(), "dist/release", manifest.filename);
    expect(existsSync(tarballPath)).toBe(true);

    const tarballBuf = readFileSync(tarballPath);

    const actualSha256 = createHash("sha256").update(tarballBuf).digest("hex");
    const actualSha512 = createHash("sha512").update(tarballBuf).digest("hex");

    expect(actualSha256).toBe(manifest.sha256);
    expect(actualSha512).toBe(manifest.sha512);
    expect(manifest.version).toBeDefined();
    expect(manifest.name).toBe("anantham-v2");
  });

  // --- 2. CLI /version Command Verification ---
  it("CLI Version Command: Returns canonical version and release channel", async () => {
    const ctrl = new SessionController({ projectRepo, sessionRepo });
    const cmdRegistry = new CommandRegistry({
      sessionController: ctrl,
      projectRepo,
      taskRepo,
      policyEngine,
      toolRegistry: registry,
    });

    const res = await cmdRegistry.execute({
      raw: "/version",
      name: "version",
      args: [],
      options: {},
    });

    expect(res.success).toBe(true);
    expect(res.message).toMatch(/^Anantham V2 v\d+\.\d+\.\d+/);
    expect((res.data as Record<string, unknown>).version).toMatch(/^\d+\.\d+\.\d+/);
  });

  // --- 3. Immediate Lease Revocation vs Side Effect Boundary ---
  it("Revocation Race: In-flight revoked lease blocks tool execution at gateway boundary", async () => {
    const now = new Date().toISOString();
    projectRepo.save({
      id: "proj_race",
      name: "Race Project",
      rootPath: join(tempDir, "proj_race"),
      status: "active",
      tags: [],
      modelProfile: "default",
      memoryNamespace: "proj_race",
      orchestrationProfile: "default",
      trustProfile: "developer",
      createdAt: now,
      lastOpenedAt: now,
      lastActivityAt: now,
    });

    sessionRepo.save({
      id: "sess_race",
      projectId: "proj_race",
      name: "Race Session",
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
      id: "task_race",
      projectId: "proj_race",
      sessionId: "sess_race",
      objective: "Race task",
      status: "queued",
      priority: "normal",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: now,
      updatedAt: now,
    });

    const claim = claimManager.claimTask({
      taskId: "task_race",
      agentId: "worker_a",
      instanceId: "inst_a",
      projectId: "proj_race",
      sessionId: "sess_race",
      ttlMs: 60000,
    });
    expect(claim.success).toBe(true);

    let executed = false;
    registry.register({
      definition: {
        name: "test_side_effect",
        description: "Test tool",
        riskLevel: "medium",
        sensitivity: "normal",
        isIdempotent: false,
        parametersSchema: { type: "object", properties: {} },
      },
      handler: async () => {
        executed = true;
        return { ok: true };
      },
    });

    // Revoke lease before execution
    leaseRepo.updateStatus(claim.lease!.id, "REVOKED");

    const obs = await gateway.invoke({
      callId: "call_race_1",
      toolName: "test_side_effect",
      arguments: {},
      actor: { id: "worker_a", type: "agent" },
      project: { id: "proj_race" },
      session: { id: "sess_race" },
      task: { id: "task_race", leaseId: claim.lease!.id, generation: claim.lease!.generation },
    });

    expect(obs.status).toBe("denied");
    expect(obs.error?.code).toBe("LEASE_FENCING_ERROR");
    expect(executed).toBe(false);
  });
});
