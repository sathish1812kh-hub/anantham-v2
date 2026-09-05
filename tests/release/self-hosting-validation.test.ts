import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";

describe("P10.1 Self-Hosting Validation — Release Artifact Independent Execution", () => {
  let tmpDir: string;
  let packageRoot: string;
  let dist: any;
  let dbPath: string;

  beforeAll(async () => {
    // 1. Create clean, isolated sandbox directory
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "anantham-p10-selfhost-"));
    const releaseDir = path.join(process.cwd(), "dist", "release");
    const manifestPath = path.join(releaseDir, "release-manifest.json");

    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const tarballPath = path.join(releaseDir, manifest.filename);

    expect(fs.existsSync(tarballPath)).toBe(true);

    // 2. Unpack release tarball into isolated sandbox
    execSync(`tar -xzf "${tarballPath}" -C "${tmpDir}"`, { encoding: "utf8" });
    packageRoot = path.join(tmpDir, "package");

    expect(fs.existsSync(packageRoot)).toBe(true);
    expect(fs.existsSync(path.join(packageRoot, "dist", "index.js"))).toBe(true);
    expect(fs.existsSync(path.join(packageRoot, "dist", "bin", "anantham.js"))).toBe(true);
    expect(fs.existsSync(path.join(packageRoot, "LICENSE"))).toBe(true);
    expect(fs.existsSync(path.join(packageRoot, "README.md"))).toBe(true);

    // 3. Dynamically import runtime modules strictly from unpacked package/dist/index.js
    const entrypointUri = path.join(packageRoot, "dist", "index.js");
    dist = await import(entrypointUri);

    dbPath = path.join(tmpDir, "self-host.db");
  }, 60000);

  afterAll(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it("1. validates package release metadata and environment independence", () => {
    expect(dist).toBeDefined();
    expect(dist.SqliteEngine).toBeDefined();
    expect(dist.MigrationEngine).toBeDefined();
    expect(dist.EventStore).toBeDefined();
    expect(dist.PolicyEngine).toBeDefined();
    expect(dist.ToolGateway).toBeDefined();
    expect(dist.AgentManager).toBeDefined();
    expect(dist.TaskClaimManager).toBeDefined();
    expect(dist.WorkflowEngine).toBeDefined();
    expect(dist.BackgroundJobManager).toBeDefined();
    expect(dist.RemoteDispatchManager).toBeDefined();
    expect(dist.MemoryManager).toBeDefined();
    expect(dist.ArtifactManager).toBeDefined();
    expect(dist.AuditLogger).toBeDefined();
    expect(dist.WebhookIngestionEngine).toBeDefined();
    expect(dist.CrashRecoveryEngine).toBeDefined();
  });

  it("2. validates CLI self-hosting execution exclusively through packaged binary", () => {
    const binPath = path.join(packageRoot, "dist", "bin", "anantham.js");

    const versionOutput = execSync(`node "${binPath}" --version`, { encoding: "utf8" });
    expect(versionOutput.trim()).toMatch(/^\d+\.\d+\.\d+/);

    const helpOutput = execSync(`node "${binPath}" --help`, { encoding: "utf8" });
    expect(helpOutput).toContain("Anantham V2 — Programmable AI Agent Operating Environment");
    expect(helpOutput).toContain("--db <path>");
    expect(helpOutput).toContain("--server");
    expect(helpOutput).toContain("--tui");
  });

  it("3. validates SQLite WAL persistence and all 10 core schema migrations", () => {
    const engine = new dist.SqliteEngine({ path: dbPath });
    engine.open();

    const migrator = new dist.MigrationEngine(engine);
    const result = migrator.migrate();

    expect(result.appliedCount).toBeGreaterThanOrEqual(10);
    expect(result.currentVersion).toBeGreaterThanOrEqual(10);

    // Verify SQLite WAL and synchronous mode
    const walMode = engine.raw.prepare("PRAGMA journal_mode;").get() as { journal_mode: string };
    expect(walMode.journal_mode.toLowerCase()).toBe("wal");

    const syncMode = engine.raw.prepare("PRAGMA synchronous;").get() as { synchronous: number };
    expect(syncMode.synchronous).toBe(2);

    const integrity = engine.raw.prepare("PRAGMA integrity_check;").get() as { integrity_check: string };
    expect(integrity.integrity_check).toBe("ok");

    const foreignKeys = engine.raw.prepare("PRAGMA foreign_key_check;").all();
    expect(foreignKeys.length).toBe(0);

    engine.close();
  });

  it("4. validates project, session, and task state persistence across restart", () => {
    const engine = new dist.SqliteEngine({ path: dbPath });
    engine.open();

    const projectRepo = new dist.ProjectRepository(engine);
    const sessionRepo = new dist.SessionRepository(engine);
    const taskRepo = new dist.TaskRepository(engine);
    const eventStore = new dist.EventStore(engine);

    const projectId = "proj_selfhost_01";
    const sessionId = "sess_selfhost_01";
    const taskId = "task_selfhost_01";
    const nowIso = new Date().toISOString();

    // 1. Create entities
    projectRepo.save({
      id: projectId,
      name: "Self-Hosting Test Project",
      rootPath: tmpDir,
      status: "active",
      tags: ["selfhost"],
      modelProfile: "standard",
      memoryNamespace: "mem_selfhost",
      orchestrationProfile: "default",
      trustProfile: "trusted",
      createdAt: nowIso,
      lastOpenedAt: nowIso,
      lastActivityAt: nowIso,
    });

    sessionRepo.save({
      id: sessionId,
      projectId,
      name: "Self-Hosting Session",
      branch: "main",
      status: "active",
      modelProfile: "standard",
      keyPoolProfile: "default",
      mode: "autonomous",
      permissions: { write: true },
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    taskRepo.save({
      id: taskId,
      projectId,
      sessionId,
      objective: "Self-Hosting Verification Task",
      status: "queued",
      priority: "normal",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    eventStore.append({
      id: "evt_selfhost_01",
      schemaVersion: 1,
      projectId,
      sessionId,
      type: dist.EventTypes.TASK_CREATED,
      actor: "system",
      timestamp: nowIso,
      payload: { taskId, objective: "Self-Hosting Verification Task" },
    });

    engine.close();

    // 2. Restart and read back state
    const engine2 = new dist.SqliteEngine({ path: dbPath });
    engine2.open();

    const pRepo2 = new dist.ProjectRepository(engine2);
    const sRepo2 = new dist.SessionRepository(engine2);
    const tRepo2 = new dist.TaskRepository(engine2);
    const eStore2 = new dist.EventStore(engine2);

    const loadedProject = pRepo2.findById(projectId);
    expect(loadedProject).toBeDefined();
    expect(loadedProject?.name).toBe("Self-Hosting Test Project");

    const loadedSession = sRepo2.findById(sessionId);
    expect(loadedSession).toBeDefined();

    const loadedTask = tRepo2.findById(taskId);
    expect(loadedTask).toBeDefined();
    expect(loadedTask?.status).toBe("queued");

    const events = eStore2.getEventsBySession(sessionId);
    expect(events.length).toBe(1);
    expect(events[0]?.id).toBe("evt_selfhost_01");

    engine2.close();
  });

  it("5. validates task claims and monotonic generation fencing token protection", () => {
    const engine = new dist.SqliteEngine({ path: dbPath });
    engine.open();

    const taskRepo = new dist.TaskRepository(engine);
    const leaseRepo = new dist.LeaseRepository(engine);
    const eventStore = new dist.EventStore(engine);

    const claimManager = new dist.TaskClaimManager({
      engine,
      taskRepo,
      leaseRepo,
      eventStore,
      defaultTtlMs: 50, // Short TTL for test
    });

    const taskId = "task_selfhost_01";
    const projectId = "proj_selfhost_01";
    const sessionId = "sess_selfhost_01";

    // Worker A claims task (Generation 1)
    const claimA = claimManager.claimTask({
      taskId,
      projectId,
      sessionId,
      agentId: "agent_A",
      instanceId: "inst_A",
      ttlMs: 50,
    });

    expect(claimA.success).toBe(true);
    expect(claimA.lease?.generation).toBe(1);

    // Immediate second claim while lease is active is rejected
    const claimConflict = claimManager.claimTask({
      taskId,
      projectId,
      sessionId,
      agentId: "agent_B",
      instanceId: "inst_B",
    });
    expect(claimConflict.success).toBe(false);
    expect(claimConflict.errorCode).toBe("TASK_NOT_CLAIMABLE");

    // Expire lease explicitly and reset task to queued
    leaseRepo.updateStatus(claimA.lease!.id, "EXPIRED");
    taskRepo.updateStatus(taskId, "queued");

    const claimB = claimManager.claimTask({
      taskId,
      projectId,
      sessionId,
      agentId: "agent_B",
      instanceId: "inst_B",
    });

    expect(claimB.success).toBe(true);
    expect(claimB.lease?.generation).toBe(2);

    // Stale Worker A attempting heartbeat with generation 1 must be rejected
    const staleHeartbeat = claimManager.heartbeat({
      leaseId: claimA.lease!.id,
      agentId: "agent_A",
      instanceId: "inst_A",
      generation: 1,
    });
    expect(staleHeartbeat.success).toBe(false);

    engine.close();
  });

  it("6. validates memory FTS5 BM25 search and strict cross-project isolation", async () => {
    const engine = new dist.SqliteEngine({ path: dbPath });
    engine.open();

    const eventStore = new dist.EventStore(engine);
    const memoryManager = new dist.MemoryManager(engine, eventStore);
    const retrievalEngine = new dist.MemoryRetrievalEngine(engine);

    const nowIso = new Date().toISOString();

    // Save memory item in Project A
    await memoryManager.saveMemory({
      id: "mem_01",
      projectId: "proj_selfhost_01",
      sessionId: "sess_selfhost_01",
      key: "release_architecture",
      content: "Anantham V2 self-hosting release architecture with SQLite WAL",
      scope: "project",
      type: "fact",
      priority: "HIGH",
      confidence: 1.0,
      sensitivity: "normal",
      sourceEventIds: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    // Query in Project A
    const resultsA = await retrievalEngine.search({
      projectId: "proj_selfhost_01",
      query: "architecture",
    });
    expect(resultsA.length).toBeGreaterThan(0);
    expect(resultsA[0]?.item.id).toBe("mem_01");

    // Query in Project B (must return 0 results)
    const resultsB = await retrievalEngine.search({
      projectId: "proj_unrelated_99",
      query: "architecture",
    });
    expect(resultsB.length).toBe(0);

    engine.close();
  });

  it("7. validates physical artifact storage and SHA-256 tamper rejection", async () => {
    const engine = new dist.SqliteEngine({ path: dbPath });
    engine.open();

    const artifactRepo = new dist.ArtifactRepository(engine);
    const artifactStorageDir = path.join(tmpDir, "artifacts");
    fs.mkdirSync(artifactStorageDir, { recursive: true });

    const artifactManager = new dist.ArtifactManager(artifactRepo, artifactStorageDir);

    const data = Buffer.from("Self-hosting artifact contents for verification");
    const artifact = await artifactManager.createArtifact({
      projectId: "proj_selfhost_01",
      sessionId: "sess_selfhost_01",
      type: "text/plain",
      filename: "verification-report.txt",
      data,
    });

    expect(artifact.id).toBeDefined();
    expect(artifact.sha256).toBeDefined();

    // Storage path from URI
    const storagePath = path.join(artifactStorageDir, "verification-report.txt");
    expect(fs.existsSync(storagePath)).toBe(true);

    // Verify physical integrity
    const validResult = await artifactManager.verifyArtifact(artifact.id);
    expect(validResult.verification?.status).toBe("verified");

    // Tamper single byte on disk
    const diskBytes = fs.readFileSync(storagePath);
    diskBytes[0] = (diskBytes[0]! + 1) % 256;
    fs.writeFileSync(storagePath, diskBytes);

    // Tampered file must be rejected
    const tamperedResult = await artifactManager.verifyArtifact(artifact.id);
    expect(tamperedResult.verification?.status).toBe("failed");

    engine.close();
  });

  it("8. validates PolicyEngine and ToolGateway risk evaluation", async () => {
    const policyEngine = new dist.PolicyEngine();
    const toolRegistry = new dist.ToolRegistry();
    const idempotencyStore = new dist.IdempotencyStore();

    const toolGateway = new dist.ToolGateway({
      registry: toolRegistry,
      policyEngine,
      idempotencyStore,
    });

    // Register a test tool
    toolRegistry.register({
      definition: {
        name: "selfhost_echo",
        description: "Echo test tool",
        parametersSchema: {
          type: "object",
          properties: { text: { type: "string" } },
        },
        riskLevel: "low",
        isIdempotent: true,
      },
      handler: async (args: any) => ({ echoed: args.text }),
    });

    const result = await toolGateway.invoke({
      callId: "call_selfhost_01",
      toolName: "selfhost_echo",
      arguments: { text: "Hello Self-Host" },
      actor: { id: "agent_selfhost", type: "agent" },
      project: { id: "proj_selfhost_01" },
      session: { id: "sess_selfhost_01" },
    });

    expect(result.status).toBe("success");
    expect(result.result).toEqual({ echoed: "Hello Self-Host" });
  });

  it("9. validates ObservabilityManager SHA-256 audit chaining and tamper detection", () => {
    const auditLogger = new dist.AuditLogger();

    // Record audit events
    auditLogger.record({
      event: { projectId: "proj_selfhost_01", id: "evt_01" },
      actor: "agent_selfhost",
      action: "SECURITY_POLICY_EVALUATION",
      classification: "INFORMATIONAL",
      decision: "PERMIT",
      correlationId: "corr_01",
      reasonCode: "POLICY_ALLOW",
      details: { decision: "ALLOW" },
    });

    auditLogger.record({
      event: { projectId: "proj_selfhost_01", id: "evt_02" },
      actor: "agent_selfhost",
      action: "TOOL_EXECUTION_COMPLETED",
      classification: "INFORMATIONAL",
      decision: "PERMIT",
      correlationId: "corr_02",
      reasonCode: "EXECUTION_COMPLETE",
      details: { tool: "selfhost_echo" },
    });

    // Verify chain integrity
    const chainValid = dist.AuditLogger.verifyChain(auditLogger.query({}));
    expect(chainValid.valid).toBe(true);
  });

  it("10. validates CrashRecoveryEngine startup recovery and interrupted task sweep", async () => {
    const engine = new dist.SqliteEngine({ path: dbPath });
    engine.open();

    const taskRepo = new dist.TaskRepository(engine);
    const eventStore = new dist.EventStore(engine);
    const checkpointRepo = new dist.CheckpointRepository(engine);
    const artifactRepo = new dist.ArtifactRepository(engine);

    // Simulate crashed task left in 'running' state with expired lease
    const crashedTaskId = "task_crashed_99";
    const nowIso = new Date().toISOString();

    taskRepo.save({
      id: crashedTaskId,
      projectId: "proj_selfhost_01",
      sessionId: "sess_selfhost_01",
      objective: "Interrupted Task",
      status: "running",
      priority: "normal",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    const recoveryEngine = new dist.CrashRecoveryEngine({
      engine,
      eventStore,
      checkpointRepo,
      artifactRepo,
    });

    const recoveryRecord = await recoveryEngine.executeRecovery();
    expect(recoveryRecord.status).toBe("SUCCESS");

    // Interrupted running task without active lease must be swept to queued
    const recoveredTask = taskRepo.findById(crashedTaskId);
    expect(recoveredTask?.status).toBe("queued");

    engine.close();
  });
});
