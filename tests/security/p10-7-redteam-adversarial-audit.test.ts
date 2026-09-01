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
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";
import { ApprovalManager } from "../../src/policy/approval-manager.js";
import { PolicyEngine } from "../../src/policy/policy-engine.js";
import { ToolGateway } from "../../src/tools/tool-gateway.js";
import { ToolRegistry } from "../../src/tools/tool-registry.js";
import { GitWorktreeManager } from "../../src/execution/git-worktree-manager.js";
import { ArtifactReferenceValidator } from "../../src/artifacts/artifact-reference-validator.js";
import { ApiIdempotencyManager } from "../../src/api/api-idempotency-manager.js";
import { ConditionEvaluator } from "../../src/workflow/condition-evaluator.js";
import { RemoteAuthVerifier } from "../../src/remote/remote-auth-verifier.js";

describe("P10.7 Pre-Production Red-Team & Invariant Verification Suite", () => {
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
    tempDir = mkdtempSync(join(tmpdir(), "anantham-p10-7-redteam-"));
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
    policyEngine = new PolicyEngine({
      version: "1.0.0",
      rules: [
        {
          ruleId: "rule_destructive",
          name: "Destructive rule",
          scope: { toolName: "destructive_tool" },
          effect: "require_approval",
          riskLevel: "critical",
          reason: "Destructive tool requires approval",
        },
      ],
    });

    registry = new ToolRegistry();
    registry.register({
      definition: {
        name: "destructive_tool",
        description: "Executes destructive changes",
        riskLevel: "critical",
        sensitivity: "normal",
        isIdempotent: false,
        requiresApproval: true,
        parametersSchema: {
          type: "object",
          properties: { payload: { type: "string" } },
          required: ["payload"],
        },
      },
      handler: async (args) => ({ result: "executed", payload: args.payload }),
    });

    gateway = new ToolGateway({
      registry,
      policyEngine,
      approvalManager,
      claimManager,
      eventStore,
    });

    const now = new Date().toISOString();
    projectRepo.save({
      id: "proj_a",
      name: "Project A",
      rootPath: join(tempDir, "proj_a"),
      status: "active",
      tags: [],
      modelProfile: "default",
      memoryNamespace: "proj_a",
      orchestrationProfile: "default",
      trustProfile: "developer",
      createdAt: now,
      lastOpenedAt: now,
      lastActivityAt: now,
    });

    projectRepo.save({
      id: "proj_b",
      name: "Project B",
      rootPath: join(tempDir, "proj_b"),
      status: "active",
      tags: [],
      modelProfile: "default",
      memoryNamespace: "proj_b",
      orchestrationProfile: "default",
      trustProfile: "developer",
      createdAt: now,
      lastOpenedAt: now,
      lastActivityAt: now,
    });

    sessionRepo.save({
      id: "sess_a",
      projectId: "proj_a",
      name: "Session A",
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
      id: "task_a",
      projectId: "proj_a",
      sessionId: "sess_a",
      objective: "Task in Project A",
      status: "queued",
      priority: "normal",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: now,
      updatedAt: now,
    });
  });

  afterEach(() => {
    engine.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  // --- W-P10.6-01 Replay Attack Tests ---
  it("W-P10.6-01: Blocks approval reuse across sequential, concurrent, and mutated invocations", async () => {
    const claim = claimManager.claimTask({
      taskId: "task_a",
      agentId: "agent_1",
      instanceId: "inst_1",
      projectId: "proj_a",
      sessionId: "sess_a",
    });
    expect(claim.success).toBe(true);

    // 1. Initial invocation requires approval
    const obs1 = await gateway.invoke({
      callId: "call_1",
      toolName: "destructive_tool",
      arguments: { payload: "wipe_disk" },
      actor: { id: "agent_1", type: "agent" },
      project: { id: "proj_a" },
      session: { id: "sess_a" },
      task: { id: "task_a", leaseId: claim.lease!.id, generation: claim.lease!.generation },
    });
    expect(obs1.status).toBe("approval_required");
    const approvalId = obs1.approvalId!;

    // 2. Human approves request
    approvalManager.grantApproval(approvalId, "human_admin");

    // 3. First execution succeeds and consumes token
    const obs2 = await gateway.invoke({
      callId: "call_2",
      toolName: "destructive_tool",
      arguments: { payload: "wipe_disk" },
      actor: { id: "agent_1", type: "agent" },
      project: { id: "proj_a" },
      session: { id: "sess_a" },
      task: { id: "task_a", leaseId: claim.lease!.id, generation: claim.lease!.generation },
      approvalId,
    });
    expect(obs2.status).toBe("success");

    // 4. Replay attack 1: Exact identical arguments replay
    const obs3 = await gateway.invoke({
      callId: "call_3",
      toolName: "destructive_tool",
      arguments: { payload: "wipe_disk" },
      actor: { id: "agent_1", type: "agent" },
      project: { id: "proj_a" },
      session: { id: "sess_a" },
      task: { id: "task_a", leaseId: claim.lease!.id, generation: claim.lease!.generation },
      approvalId,
    });
    expect(obs3.status).toBe("denied");
    expect(obs3.error?.code).toBe("APPROVAL_INVALID");

    // 5. Replay attack 2: Mutated arguments replay
    const obs4 = await gateway.invoke({
      callId: "call_4",
      toolName: "destructive_tool",
      arguments: { payload: "different_payload" },
      actor: { id: "agent_1", type: "agent" },
      project: { id: "proj_a" },
      session: { id: "sess_a" },
      task: { id: "task_a", leaseId: claim.lease!.id, generation: claim.lease!.generation },
      approvalId,
    });
    expect(obs4.status).toBe("denied");
    expect(obs4.error?.code).toBe("APPROVAL_INVALID");
  });

  // --- W-P10.6-02 Git Ref Sanitization Tests ---
  it("W-P10.6-02: Strict regex rejects dangerous git refs, flags, command separators, and path traversal", () => {
    const dangerousRefs = [
      "; rm -rf /",
      "&& whoami",
      "| cat /etc/passwd",
      "--upload-pack=evil",
      "--exec=calc.exe",
      "-b",
      "../escape",
      "feat\nnewline",
      "feat\rCR",
      "refs/heads/master..origin/master",
    ];

    for (const ref of dangerousRefs) {
      expect(() => {
        GitWorktreeManager.validateRef(ref, "branchName");
      }).toThrow();
    }

    const safeRefs = [
      "main",
      "feature/branch-123",
      "release_v2.0.0",
      "user/test-fix.1",
      "a".repeat(40),
    ];

    for (const ref of safeRefs) {
      expect(() => {
        GitWorktreeManager.validateRef(ref, "branchName");
      }).not.toThrow();
    }
  });

  // --- W-01 Path Traversal Tests ---
  it("W-01: ArtifactReferenceValidator rejects sibling path prefix escapes", () => {
    const projectRoot = join(tempDir, "proj_a");
    const siblingRoot = join(tempDir, "proj_a_evil");

    const validRes = ArtifactReferenceValidator.validateStoragePath(join(projectRoot, "sub", "file.txt"), projectRoot);
    expect(validRes.isValid).toBe(true);

    const siblingRes = ArtifactReferenceValidator.validateStoragePath(siblingRoot, projectRoot);
    expect(siblingRes.isValid).toBe(false);

    const secretRes = ArtifactReferenceValidator.validateStoragePath(join(siblingRoot, "secret.txt"), projectRoot);
    expect(secretRes.isValid).toBe(false);
  });

  // --- W-03 Idempotency Scoping Tests ---
  it("W-03: ApiIdempotencyManager prevents route collision and payload mutation attacks", () => {
    const idempManager = new ApiIdempotencyManager();
    const key = "idemp_test_key";
    const ctxA = { method: "POST", pathname: "/api/v1/tasks", bodyHash: "hash_a" };
    const ctxB = { method: "POST", pathname: "/api/v1/tasks", bodyHash: "hash_b" };
    const ctxDiffRoute = { method: "POST", pathname: "/api/v1/sessions", bodyHash: "hash_a" };

    // Initial check -> not cached
    expect(idempManager.get(key, ctxA)).toBeUndefined();

    // Store response
    idempManager.set(key, 201, { id: "task_1" }, ctxA);

    // Same route, same payload -> returns cached
    const cached = idempManager.get(key, ctxA);
    expect(cached).toBeDefined();
    expect(cached?.statusCode).toBe(201);

    // Same route, mutated payload -> throws IdempotencyConflictError
    expect(() => {
      idempManager.get(key, ctxB);
    }).toThrow();

    // Different route, same key -> throws IdempotencyConflictError
    expect(() => {
      idempManager.get(key, ctxDiffRoute);
    }).toThrow();
  });

  // --- W-P10.5-01 Lease Fencing Verification ---
  it("W-P10.5-01: ToolGateway rejects side-effect execution for stale worker generation", async () => {
    const claim1 = claimManager.claimTask({
      taskId: "task_a",
      agentId: "worker_1",
      instanceId: "inst_1",
      projectId: "proj_a",
      sessionId: "sess_a",
      ttlMs: 30,
    });
    expect(claim1.success).toBe(true);

    // Expire lease
    await new Promise((r) => setTimeout(r, 50));

    // Sweep/expire lease via heartbeat attempt
    claimManager.heartbeat({
      leaseId: claim1.lease!.id,
      agentId: "worker_1",
      instanceId: "inst_1",
      generation: claim1.lease!.generation,
    });

    // Worker 2 claims task at generation 2
    const claim2 = claimManager.claimTask({
      taskId: "task_a",
      agentId: "worker_2",
      instanceId: "inst_2",
      projectId: "proj_a",
      sessionId: "sess_a",
      ttlMs: 5000,
    });
    expect(claim2.success).toBe(true);
    expect(claim2.lease?.generation).toBe(2);

    // Worker 1 attempts tool invocation using stale generation 1
    const obs = await gateway.invoke({
      callId: "call_stale_1",
      toolName: "destructive_tool",
      arguments: { payload: "data" },
      actor: { id: "worker_1", type: "agent" },
      project: { id: "proj_a" },
      session: { id: "sess_a" },
      task: { id: "task_a", leaseId: claim1.lease!.id, generation: claim1.lease!.generation },
    });

    expect(obs.status).toBe("denied");
    expect(obs.error?.code).toBe("LEASE_FENCING_ERROR");
  });

  // --- W-P10.5-02 Quote-Aware Condition Evaluation ---
  it("W-P10.5-02: ConditionEvaluator correctly handles comparison operators inside quoted strings", () => {
    const evaluator = new ConditionEvaluator();
    const context = {
      variables: {
        status: "<critical>",
        message: "warning: val > 100",
        count: 42,
      },
    };

    expect(evaluator.evaluate({
      type: "expression",
      expression: 'status == "<critical>"',
    }, context)).toBe(true);

    expect(evaluator.evaluate({
      type: "expression",
      expression: 'status == "<normal>"',
    }, context)).toBe(false);

    expect(evaluator.evaluate({
      type: "expression",
      expression: 'message == "warning: val > 100"',
    }, context)).toBe(true);
  });

  // --- W-P10.5-04 Canonical HMAC Verification ---
  it("W-P10.5-04: RemoteAuthVerifier enforces key-sorted canonical serialization for signature verification", () => {
    const verifier = new RemoteAuthVerifier({ secretKey: "shared_secret_123" });
    const payload1 = { b: 2, a: 1, nested: { z: 10, y: 20 } };
    const payload2 = { a: 1, b: 2, nested: { y: 20, z: 10 } };

    const sig1 = verifier.signPayload(payload1);
    const sig2 = verifier.signPayload(payload2);

    expect(sig1).toBe(sig2);
    expect(verifier.verifySignature(payload1, sig1)).toBe(true);
    expect(verifier.verifySignature(payload2, sig1)).toBe(true);
  });
});
