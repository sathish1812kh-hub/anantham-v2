import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { WorkspaceRepository } from "../../src/persistence/repositories/workspace-repository.js";
import { LeaseRepository } from "../../src/persistence/repositories/lease-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";
import { WorkspaceManager } from "../../src/execution/workspace-manager.js";
import { WorkspaceIntegrator } from "../../src/execution/workspace-integrator.js";
import { GitWorktreeManager } from "../../src/execution/git-worktree-manager.js";
import { createTempGitRepo, createProjectAndSession, type TempGitRepo } from "./git-test-helper.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

describe("P6.4 Parallel Execution — Safe Integration & Verification Gate", () => {
  let db: SqliteEngine;
  let workspaceRepo: WorkspaceRepository;
  let leaseRepo: LeaseRepository;
  let taskRepo: TaskRepository;
  let claimManager: TaskClaimManager;
  let worktreeManager: GitWorktreeManager;
  let workspaceManager: WorkspaceManager;
  let integrator: WorkspaceIntegrator;
  let tempRepo: TempGitRepo;

  beforeEach(async () => {
    tempRepo = await createTempGitRepo();
    db = new SqliteEngine({ path: ":memory:" });
    db.open();
    const migrator = new MigrationEngine(db);
    migrator.migrate();

    createProjectAndSession(db, "proj_int", "sess_int");

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
      verificationFn: async (worktreePath) => {
        // Verification succeeds if no syntax errors / files exist
        return fs.existsSync(path.join(worktreePath, "src", "feature.ts"));
      },
    });
  });

  afterEach(() => {
    db.close();
    tempRepo.cleanup();
  });

  it("verifies and cleanly integrates a non-conflicting change into the target repository", async () => {
    taskRepo.save({
      id: "task_safe_int",
      sessionId: "sess_int",
      projectId: "proj_int",
      title: "Safe Integration",
      description: "Clean non-conflicting feature",
      objective: "Clean non-conflicting feature",
      status: "queued",
      priority: "high",
      targetFiles: ["src/feature.ts"],
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

    const claim = claimManager.claimTask({
      taskId: "task_safe_int",
      agentId: "agent_dev",
      instanceId: "inst_dev_01",
      projectId: "proj_int",
      sessionId: "sess_int",
    });

    const wsRes = await workspaceManager.allocateWorkspace({
      projectId: "proj_int",
      taskId: "task_safe_int",
      agentId: "agent_dev",
      instanceId: "inst_dev_01",
      leaseId: claim.lease!.id,
      generation: claim.lease!.generation,
      repoPath: tempRepo.repoPath,
    });

    // Make change in worktree and commit
    fs.writeFileSync(
      path.join(wsRes.workspace!.worktreePath, "src", "feature.ts"),
      "export const VerifiedFeature = true;\n"
    );
    await execAsync('git add . && git commit -m "feat: add verified feature"', {
      cwd: wsRes.workspace!.worktreePath,
    });

    // Integrate
    const intRes = await integrator.integrate({
      workspaceId: wsRes.workspace!.id,
      taskId: "task_safe_int",
      agentId: "agent_dev",
      instanceId: "inst_dev_01",
      leaseId: claim.lease!.id,
      generation: claim.lease!.generation,
      targetBranch: "main",
      runVerification: true,
    }, tempRepo.repoPath);

    expect(intRes.success).toBe(true);
    expect(intRes.status).toBe("INTEGRATED");
    expect(intRes.integratedCommit).toBeDefined();

    // Verify change is present on main target repository
    expect(fs.existsSync(path.join(tempRepo.repoPath, "src", "feature.ts"))).toBe(true);

    // Clean up
    await workspaceManager.cleanupWorkspace(wsRes.workspace!.id, tempRepo.repoPath, true);
  }, 25000);
});
