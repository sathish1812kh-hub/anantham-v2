import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { WorkspaceRepository } from "../../src/persistence/repositories/workspace-repository.js";
import { LeaseRepository } from "../../src/persistence/repositories/lease-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";
import { WorkspaceManager } from "../../src/execution/workspace-manager.js";
import { WorkspaceRecoveryEngine } from "../../src/execution/workspace-recovery-engine.js";
import { GitWorktreeManager } from "../../src/execution/git-worktree-manager.js";
import { createTempGitRepo, createProjectAndSession, type TempGitRepo } from "./git-test-helper.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

describe("P6.4 Parallel Execution — Abandoned Workspace Quarantine & Evidence Preservation", () => {
  let db: SqliteEngine;
  let workspaceRepo: WorkspaceRepository;
  let leaseRepo: LeaseRepository;
  let taskRepo: TaskRepository;
  let claimManager: TaskClaimManager;
  let worktreeManager: GitWorktreeManager;
  let workspaceManager: WorkspaceManager;
  let recoveryEngine: WorkspaceRecoveryEngine;
  let tempRepo: TempGitRepo;

  beforeEach(async () => {
    tempRepo = await createTempGitRepo();
    db = new SqliteEngine({ path: ":memory:" });
    db.open();
    const migrator = new MigrationEngine(db);
    migrator.migrate();

    createProjectAndSession(db, "proj_ab", "sess_ab");

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
    recoveryEngine = new WorkspaceRecoveryEngine({
      workspaceRepo,
      leaseRepo,
      worktreeManager,
    });
  });

  afterEach(() => {
    db.close();
    tempRepo.cleanup();
  });

  it("detects an abandoned dirty workspace, preserves work into quarantine patch artifact, and avoids destroying evidence", async () => {
    taskRepo.save({
      id: "task_abandoned_01",
      sessionId: "sess_ab",
      projectId: "proj_ab",
      title: "Abandoned Task",
      description: "Crashed agent task",
      objective: "Crashed agent task",
      status: "queued",
      priority: "high",
      targetFiles: ["src/uncommitted.ts"],
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
      taskId: "task_abandoned_01",
      agentId: "agent_crashed",
      instanceId: "inst_crashed",
      projectId: "proj_ab",
      sessionId: "sess_ab",
    });

    const wsRes = await workspaceManager.allocateWorkspace({
      projectId: "proj_ab",
      taskId: "task_abandoned_01",
      agentId: "agent_crashed",
      instanceId: "inst_crashed",
      leaseId: claim.lease!.id,
      generation: claim.lease!.generation,
      repoPath: tempRepo.repoPath,
    });

    // Agent wrote valuable work in worktree and committed
    fs.writeFileSync(
      path.join(wsRes.workspace!.worktreePath, "src", "uncommitted.ts"),
      "export const ValuableWipCode = 999;\n"
    );
    await execAsync('git add . && git commit -m "feat: valuable wip"', {
      cwd: wsRes.workspace!.worktreePath,
    });

    // Agent crashes and lease expires
    leaseRepo.updateStatus(claim.lease!.id, "EXPIRED");

    // Recovery engine sweeps project workspaces
    const recoverySummary = await recoveryEngine.recoverWorkspaces("proj_ab", tempRepo.repoPath);

    expect(recoverySummary.quarantinedCount).toBe(1);
    expect(recoverySummary.quarantinedWorkspaces).toContain(wsRes.workspace!.id);

    // Verify workspace status is QUARANTINED
    const updatedWs = workspaceRepo.findById(wsRes.workspace!.id);
    expect(updatedWs?.status).toBe("QUARANTINED");
    expect(updatedWs?.cleanupState).toBe("QUARANTINED");

    // Verify quarantine record has the patch preserved
    const quarantineRecords = workspaceRepo.getQuarantineRecords(wsRes.workspace!.id);
    expect(quarantineRecords.length).toBe(1);
    expect(quarantineRecords[0].patch).toContain("ValuableWipCode");
  });
});
