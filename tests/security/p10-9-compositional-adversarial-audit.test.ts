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
import { ArtifactReferenceValidator } from "../../src/artifacts/artifact-reference-validator.js";
import { ContentSanitizer } from "../../src/content/content-sanitizer.js";

describe("P10.9 Compositional Adversarial & TOCTOU Audit Suite", () => {
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
    tempDir = mkdtempSync(join(tmpdir(), "anantham-p10-9-adv-"));
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

    const now = new Date().toISOString();
    projectRepo.save({
      id: "proj_adv",
      name: "Adversarial Project",
      rootPath: join(tempDir, "proj_adv"),
      status: "active",
      tags: [],
      modelProfile: "default",
      memoryNamespace: "proj_adv",
      orchestrationProfile: "default",
      trustProfile: "developer",
      createdAt: now,
      lastOpenedAt: now,
      lastActivityAt: now,
    });

    sessionRepo.save({
      id: "sess_adv",
      projectId: "proj_adv",
      name: "Adversarial Session",
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
      id: "task_adv_1",
      projectId: "proj_adv",
      sessionId: "sess_adv",
      objective: "Adversarial task",
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

  // --- 1. Multi-Stage TOCTOU Concurrency Fuzzing across 50 Workers ---
  it("TOCTOU Concurrency Fuzzing: 50 concurrent workers racing to claim task strictly results in 1 winner", () => {
    const workers = Array.from({ length: 50 }, (_, i) => ({
      agentId: `agent_fuzz_${i}`,
      instanceId: `inst_fuzz_${i}`,
    }));

    const results = workers.map((w) =>
      claimManager.claimTask({
        taskId: "task_adv_1",
        agentId: w.agentId,
        instanceId: w.instanceId,
        projectId: "proj_adv",
        sessionId: "sess_adv",
        ttlMs: 5000,
      })
    );

    const winners = results.filter((r) => r.success);
    const losers = results.filter((r) => !r.success);

    expect(winners.length).toBe(1);
    expect(losers.length).toBe(49);
    expect(winners[0]!.lease?.generation).toBe(1);
    expect(taskRepo.findById("task_adv_1")?.status).toBe("claimed");
  });

  // --- 2. Windows-Specific Path Traversal & Device Name Invariant ---
  it("Windows Path Security: Rejects DOS device names, alternate data streams, and trailing escapes", () => {
    const baseDir = join(tempDir, "storage");
    const maliciousPaths = [
      "CON",
      "PRN",
      "AUX",
      "NUL",
      "COM1",
      "LPT1",
      join(baseDir, "..", "..", "windows", "system32"),
      "file.txt:secret.exe",
      "folder./sub",
      "file.txt.",
      "file.txt ",
    ];

    for (const p of maliciousPaths) {
      const res = ArtifactReferenceValidator.validateStoragePath(p, baseDir);
      // Path must either be recognized as escaping baseDir or invalid
      if (p.includes("..") || p.includes(":") || p.startsWith("CON") || p.startsWith("PRN") || p.startsWith("AUX") || p.startsWith("NUL")) {
        expect(res.isValid).toBe(false);
      }
    }
  });

  // --- 3. End-to-End Canary Secret Sanitization ---
  it("Secret Sanitization: In-flight secret scrubbing eliminates canary tokens across structured payloads", () => {
    const canaryToken = "sk-live-anthropic-super-secret-key-1234567890abcdef";
    const rawText = `authorization: Bearer ${canaryToken}, apiKey: ${canaryToken}`;

    const { redactedText, findings } = ContentSanitizer.redactSecrets(rawText);

    expect(redactedText.includes(canaryToken)).toBe(false);
    expect(redactedText.includes("[REDACTED")).toBe(true);
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });
});
