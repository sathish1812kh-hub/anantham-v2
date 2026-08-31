import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { WorkspaceRepository } from "../../src/persistence/repositories/workspace-repository.js";
import { LeaseRepository } from "../../src/persistence/repositories/lease-repository.js";
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { WorkspaceManager } from "../../src/execution/workspace-manager.js";
import { GitWorktreeManager } from "../../src/execution/git-worktree-manager.js";
import { createTempGitRepo, createProjectAndSession, type TempGitRepo } from "./git-test-helper.js";
import * as fs from "node:fs";
import * as path from "node:path";

describe("P6.4 Parallel Execution — Worktree Allocation & Isolation", () => {
  let db: SqliteEngine;
  let workspaceRepo: WorkspaceRepository;
  let leaseRepo: LeaseRepository;
  let taskRepo: TaskRepository;
  let claimManager: TaskClaimManager;
  let worktreeManager: GitWorktreeManager;
  let workspaceManager: WorkspaceManager;
  let tempRepo: TempGitRepo;

  beforeEach(async () => {
    tempRepo = await createTempGitRepo();
    db = new SqliteEngine({ path: ":memory:" });
    db.open();
    const migrator = new MigrationEngine(db);
    migrator.migrate();

    createProjectAndSession(db, "proj_01", "sess_01");

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
  });

  afterEach(() => {
    db.close();
    tempRepo.cleanup();
  });

  it("allocates two completely isolated worktrees for two parallel agents", async () => {
    // 1. Create two tasks and claims
    taskRepo.save({
      id: "task_par_01",
      sessionId: "sess_01",
      projectId: "proj_01",
      title: "Task 1",
      description: "Parallel task 1",
      objective: "Parallel task 1",
      status: "queued",
      priority: "high",
      targetFiles: ["src/feature1.ts"],
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
      id: "task_par_02",
      sessionId: "sess_01",
      projectId: "proj_01",
      title: "Task 2",
      description: "Parallel task 2",
      objective: "Parallel task 2",
      status: "queued",
      priority: "high",
      targetFiles: ["src/feature2.ts"],
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

    const claim1 = claimManager.claimTask({
      taskId: "task_par_01",
      agentId: "agent_alpha",
      instanceId: "inst_alpha_01",
      projectId: "proj_01",
      sessionId: "sess_01",
    });
    expect(claim1.success).toBe(true);

    const claim2 = claimManager.claimTask({
      taskId: "task_par_02",
      agentId: "agent_beta",
      instanceId: "inst_beta_01",
      projectId: "proj_01",
      sessionId: "sess_01",
    });
    expect(claim2.success).toBe(true);

    // 2. Allocate workspaces for both
    const ws1Res = await workspaceManager.allocateWorkspace({
      projectId: "proj_01",
      taskId: "task_par_01",
      agentId: "agent_alpha",
      instanceId: "inst_alpha_01",
      leaseId: claim1.lease!.id,
      generation: claim1.lease!.generation,
      repoPath: tempRepo.repoPath,
    });
    expect(ws1Res.success).toBe(true);
    expect(fs.existsSync(ws1Res.workspace!.worktreePath)).toBe(true);

    const ws2Res = await workspaceManager.allocateWorkspace({
      projectId: "proj_01",
      taskId: "task_par_02",
      agentId: "agent_beta",
      instanceId: "inst_beta_01",
      leaseId: claim2.lease!.id,
      generation: claim2.lease!.generation,
      repoPath: tempRepo.repoPath,
    });
    expect(ws2Res.success).toBe(true);
    expect(fs.existsSync(ws2Res.workspace!.worktreePath)).toBe(true);

    // 3. Verify file isolation: writes in ws1 are not visible in ws2
    fs.writeFileSync(path.join(ws1Res.workspace!.worktreePath, "src", "feature1.ts"), "export const Feature1 = true;\n");
    expect(fs.existsSync(path.join(ws1Res.workspace!.worktreePath, "src", "feature1.ts"))).toBe(true);
    expect(fs.existsSync(path.join(ws2Res.workspace!.worktreePath, "src", "feature1.ts"))).toBe(false);

    // 4. Safe cleanup of ws1 and ws2
    const cleaned1 = await workspaceManager.cleanupWorkspace(ws1Res.workspace!.id, tempRepo.repoPath, true);
    expect(cleaned1).toBe(true);
    expect(workspaceRepo.findById(ws1Res.workspace!.id)?.status).toBe("CLEANED");

    const cleaned2 = await workspaceManager.cleanupWorkspace(ws2Res.workspace!.id, tempRepo.repoPath, true);
    expect(cleaned2).toBe(true);
  });
});
