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

describe("P6.4 Parallel Execution — User Work Protection", () => {
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

    createProjectAndSession(db, "proj_u", "sess_u");

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
  });

  afterEach(() => {
    db.close();
    tempRepo.cleanup();
  });

  it("strictly blocks integration when target repository contains uncommitted user modifications", async () => {
    // 1. Setup task and workspace
    taskRepo.save({
      id: "task_user_prot",
      sessionId: "sess_u",
      projectId: "proj_u",
      title: "User Protection Task",
      description: "Do not overwrite user",
      objective: "Do not overwrite user",
      status: "queued",
      priority: "high",
      targetFiles: ["src/feature_agent.ts"],
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
      taskId: "task_user_prot",
      agentId: "agent_dev",
      instanceId: "inst_dev_01",
      projectId: "proj_u",
      sessionId: "sess_u",
    });

    const wsRes = await workspaceManager.allocateWorkspace({
      projectId: "proj_u",
      taskId: "task_user_prot",
      agentId: "agent_dev",
      instanceId: "inst_dev_01",
      leaseId: claim.lease!.id,
      generation: claim.lease!.generation,
      repoPath: tempRepo.repoPath,
    });

    // 2. Agent makes changes in isolated worktree and commits
    const agentFile = path.join(wsRes.workspace!.worktreePath, "src", "feature_agent.ts");
    fs.writeFileSync(agentFile, "export const AgentFeature = 42;\n");
    await execAsync('git add . && git commit -m "feat: agent change"', { cwd: wsRes.workspace!.worktreePath });

    // 3. User edits a file directly in the main target repo without committing
    fs.writeFileSync(path.join(tempRepo.repoPath, "README.md"), "# User WIP Edits - Do Not Overwrite!\n");

    // 4. Agent attempts integration
    const intRes = await integrator.integrate({
      workspaceId: wsRes.workspace!.id,
      taskId: "task_user_prot",
      agentId: "agent_dev",
      instanceId: "inst_dev_01",
      leaseId: claim.lease!.id,
      generation: claim.lease!.generation,
      targetBranch: "main",
      runVerification: false,
    }, tempRepo.repoPath);

    // 5. Must fail closed with USER_CHANGE_BLOCKED
    expect(intRes.success).toBe(false);
    expect(intRes.status).toBe("USER_CHANGE_BLOCKED");
    expect(intRes.errorMessage).toContain("uncommitted user modifications");

    // 6. User edits remain completely intact
    const userContent = fs.readFileSync(path.join(tempRepo.repoPath, "README.md"), "utf-8");
    expect(userContent).toContain("User WIP Edits - Do Not Overwrite!");

    // Clean up
    await workspaceManager.cleanupWorkspace(wsRes.workspace!.id, tempRepo.repoPath, true);
  });
});
