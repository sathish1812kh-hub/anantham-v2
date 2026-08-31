import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { WorkspaceRepository } from "../../src/persistence/repositories/workspace-repository.js";
import { LeaseRepository } from "../../src/persistence/repositories/lease-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";
import { WorkspaceManager } from "../../src/execution/workspace-manager.js";
import { WorkspaceIntegrator } from "../../src/execution/workspace-integrator.js";
import { ParallelOrchestrator } from "../../src/execution/parallel-orchestrator.js";
import { GitWorktreeManager } from "../../src/execution/git-worktree-manager.js";
import { createTempGitRepo, createProjectAndSession, type TempGitRepo } from "./git-test-helper.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

describe("P6.4 Parallel Execution — Serialization Fallback", () => {
  let db: SqliteEngine;
  let workspaceRepo: WorkspaceRepository;
  let leaseRepo: LeaseRepository;
  let taskRepo: TaskRepository;
  let claimManager: TaskClaimManager;
  let worktreeManager: GitWorktreeManager;
  let workspaceManager: WorkspaceManager;
  let integrator: WorkspaceIntegrator;
  let orchestrator: ParallelOrchestrator;
  let tempRepo: TempGitRepo;

  beforeEach(async () => {
    tempRepo = await createTempGitRepo();
    db = new SqliteEngine({ path: ":memory:" });
    db.open();
    const migrator = new MigrationEngine(db);
    migrator.migrate();

    createProjectAndSession(db, "proj_seq", "sess_seq");

    workspaceRepo = new WorkspaceRepository(db);
    leaseRepo = new LeaseRepository(db);
    taskRepo = new TaskRepository(db);
    claimManager = new TaskClaimManager({ engine: db, taskRepo, leaseRepo });
    worktreeManager = new GitWorktreeManager({ projectRoot: tempRepo.repoPath });
    workspaceManager = new WorkspaceManager({
      workspaceRepo,
      leaseRepo,
      claimManager,
      worktreeManager,
    });
    integrator = new WorkspaceIntegrator({
      workspaceRepo,
      claimManager,
      worktreeManager,
    });
    orchestrator = new ParallelOrchestrator({
      workspaceManager,
      workspaceIntegrator: integrator,
      workspaceRepo,
    });
  });

  afterEach(() => {
    db.close();
    tempRepo.cleanup();
  });

  it("safely serializes integration when Workspace A integrates first and Workspace B rebases cleanly", async () => {
    // 1. Task A & Task B
    taskRepo.save({
      id: "task_seq_A",
      sessionId: "sess_seq",
      projectId: "proj_seq",
      title: "Task A",
      description: "First task",
      objective: "First task",
      status: "queued",
      priority: "high",
      targetFiles: ["src/featureA.ts"],
      readOnlyFiles: [],
      dependencies: [],
      subtasks: [],
      inputArtifacts: [],
      outputArtifacts: [],
      assignedAgent: null,
      contextBudgetTokens: 10000,
      modelProfile: "default",
      requiredCapabilities: [],
      acceptanceCriteria: [],
      retryCount: 0,
      maxRetries: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    taskRepo.save({
      id: "task_seq_B",
      sessionId: "sess_seq",
      projectId: "proj_seq",
      title: "Task B",
      description: "Second task",
      objective: "Second task",
      status: "queued",
      priority: "high",
      targetFiles: ["src/featureB.ts"],
      readOnlyFiles: [],
      dependencies: [],
      subtasks: [],
      inputArtifacts: [],
      outputArtifacts: [],
      assignedAgent: null,
      contextBudgetTokens: 10000,
      modelProfile: "default",
      requiredCapabilities: [],
      acceptanceCriteria: [],
      retryCount: 0,
      maxRetries: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const claimA = claimManager.claimTask({
      taskId: "task_seq_A",
      agentId: "agent_A",
      instanceId: "inst_A",
      projectId: "proj_seq",
      sessionId: "sess_seq",
    });

    const claimB = claimManager.claimTask({
      taskId: "task_seq_B",
      agentId: "agent_B",
      instanceId: "inst_B",
      projectId: "proj_seq",
      sessionId: "sess_seq",
    });

    // 2. Both allocate workspaces from the same initial base
    const wsA = await orchestrator.spawnParallelWorkspace({
      projectId: "proj_seq",
      taskId: "task_seq_A",
      agentId: "agent_A",
      instanceId: "inst_A",
      leaseId: claimA.lease!.id,
      generation: claimA.lease!.generation,
      repoPath: tempRepo.repoPath,
    });

    const wsB = await orchestrator.spawnParallelWorkspace({
      projectId: "proj_seq",
      taskId: "task_seq_B",
      agentId: "agent_B",
      instanceId: "inst_B",
      leaseId: claimB.lease!.id,
      generation: claimB.lease!.generation,
      repoPath: tempRepo.repoPath,
    });

    // 3. Agent A modifies featureA.ts and commits
    fs.writeFileSync(path.join(wsA.workspace!.worktreePath, "src", "featureA.ts"), "export const FeatureA = 1;\n");
    await execAsync('git add . && git commit -m "feat: feature A"', { cwd: wsA.workspace!.worktreePath });

    // 4. Agent B modifies featureB.ts and commits
    fs.writeFileSync(path.join(wsB.workspace!.worktreePath, "src", "featureB.ts"), "export const FeatureB = 2;\n");
    await execAsync('git add . && git commit -m "feat: feature B"', { cwd: wsB.workspace!.worktreePath });

    // 5. Agent A integrates first
    const intResA = await integrator.integrate({
      workspaceId: wsA.workspace!.id,
      taskId: "task_seq_A",
      agentId: "agent_A",
      instanceId: "inst_A",
      leaseId: claimA.lease!.id,
      generation: claimA.lease!.generation,
      targetBranch: "main",
      runVerification: false,
    }, tempRepo.repoPath);
    expect(intResA.success).toBe(true);

    // 6. Agent B attempts integration via Serialization Fallback (which rebases onto target)
    const intResB = await orchestrator.integrateWithSerializationFallback({
      workspaceId: wsB.workspace!.id,
      taskId: "task_seq_B",
      agentId: "agent_B",
      instanceId: "inst_B",
      leaseId: claimB.lease!.id,
      generation: claimB.lease!.generation,
      targetBranch: "main",
      runVerification: false,
    }, tempRepo.repoPath);

    expect(intResB.success).toBe(true);
    expect(intResB.status).toBe("INTEGRATED");

    // Both featureA and featureB exist on main target repository
    expect(fs.existsSync(path.join(tempRepo.repoPath, "src", "featureA.ts"))).toBe(true);
    expect(fs.existsSync(path.join(tempRepo.repoPath, "src", "featureB.ts"))).toBe(true);

    // Clean up
    await orchestrator.cleanup(wsA.workspace!.id, tempRepo.repoPath);
    await orchestrator.cleanup(wsB.workspace!.id, tempRepo.repoPath);
  }, 20000);
});
