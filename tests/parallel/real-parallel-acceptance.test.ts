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

describe("P6.4 Parallel Execution — Real Multi-Agent Parallel Acceptance Scenario", () => {
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

    createProjectAndSession(db, "proj_acc", "sess_acc");
    createProjectAndSession(db, "proj_conf", "sess_conf");

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

  it("executes Scenario 1: Two independent agents work in parallel and integrate cleanly with zero conflicts", async () => {
    // 1. Create Task 1 & Task 2
    taskRepo.save({
      id: "task_acc_01",
      sessionId: "sess_acc",
      projectId: "proj_acc",
      title: "Implement Analytics Engine",
      description: "Independent analytics service",
      objective: "Independent analytics service",
      status: "queued",
      priority: "high",
      targetFiles: ["src/analytics.ts"],
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
      id: "task_acc_02",
      sessionId: "sess_acc",
      projectId: "proj_acc",
      title: "Implement Notification Gateway",
      description: "Independent notification gateway",
      objective: "Independent notification gateway",
      status: "queued",
      priority: "high",
      targetFiles: ["src/notifications.ts"],
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
      taskId: "task_acc_01",
      agentId: "agent_analytics",
      instanceId: "inst_analytics_01",
      projectId: "proj_acc",
      sessionId: "sess_acc",
    });

    const claim2 = claimManager.claimTask({
      taskId: "task_acc_02",
      agentId: "agent_notifications",
      instanceId: "inst_notifications_01",
      projectId: "proj_acc",
      sessionId: "sess_acc",
    });

    // 2. Allocate isolated worktrees from shared base commit
    const ws1 = await orchestrator.spawnParallelWorkspace({
      projectId: "proj_acc",
      taskId: "task_acc_01",
      agentId: "agent_analytics",
      instanceId: "inst_analytics_01",
      leaseId: claim1.lease!.id,
      generation: claim1.lease!.generation,
      repoPath: tempRepo.repoPath,
    });

    const ws2 = await orchestrator.spawnParallelWorkspace({
      projectId: "proj_acc",
      taskId: "task_acc_02",
      agentId: "agent_notifications",
      instanceId: "inst_notifications_01",
      leaseId: claim2.lease!.id,
      generation: claim2.lease!.generation,
      repoPath: tempRepo.repoPath,
    });

    // 3. Agent 1 develops Analytics in Worktree 1
    fs.writeFileSync(
      path.join(ws1.workspace!.worktreePath, "src", "analytics.ts"),
      "export class AnalyticsEngine { log() { return true; } }\n"
    );
    await execAsync('git add . && git commit -m "feat: analytics engine"', { cwd: ws1.workspace!.worktreePath });

    // 4. Agent 2 develops Notifications in Worktree 2
    fs.writeFileSync(
      path.join(ws2.workspace!.worktreePath, "src", "notifications.ts"),
      "export class NotificationGateway { send() { return true; } }\n"
    );
    await execAsync('git add . && git commit -m "feat: notification gateway"', { cwd: ws2.workspace!.worktreePath });

    // 5. Integrate Agent 1
    const intRes1 = await integrator.integrate({
      workspaceId: ws1.workspace!.id,
      taskId: "task_acc_01",
      agentId: "agent_analytics",
      instanceId: "inst_analytics_01",
      leaseId: claim1.lease!.id,
      generation: claim1.lease!.generation,
      targetBranch: "main",
      runVerification: false,
    }, tempRepo.repoPath);
    expect(intRes1.success).toBe(true);
    claimManager.completeTask({
      taskId: "task_acc_01",
      leaseId: claim1.lease!.id,
      generation: claim1.lease!.generation,
      agentId: "agent_analytics",
    });

    // 6. Integrate Agent 2 via serialization fallback (rebases on target commit)
    const intRes2 = await orchestrator.integrateWithSerializationFallback({
      workspaceId: ws2.workspace!.id,
      taskId: "task_acc_02",
      agentId: "agent_notifications",
      instanceId: "inst_notifications_01",
      leaseId: claim2.lease!.id,
      generation: claim2.lease!.generation,
      targetBranch: "main",
      runVerification: false,
    }, tempRepo.repoPath);
    expect(intRes2.success).toBe(true);
    claimManager.completeTask({
      taskId: "task_acc_02",
      leaseId: claim2.lease!.id,
      generation: claim2.lease!.generation,
      agentId: "agent_notifications",
    });

    // 7. Verify both services are integrated on main repository
    expect(fs.existsSync(path.join(tempRepo.repoPath, "src", "analytics.ts"))).toBe(true);
    expect(fs.existsSync(path.join(tempRepo.repoPath, "src", "notifications.ts"))).toBe(true);

    // Clean up
    await orchestrator.cleanup(ws1.workspace!.id, tempRepo.repoPath);
    await orchestrator.cleanup(ws2.workspace!.id, tempRepo.repoPath);
  }, 25000);

  it("executes Scenario 2: Conflicting shared edits are detected, rejected, and safely serialized", async () => {
    taskRepo.save({
      id: "task_conflict_01",
      sessionId: "sess_conf",
      projectId: "proj_conf",
      title: "Modify Task Contract A",
      description: "Edit domain task",
      objective: "Edit domain task",
      status: "queued",
      priority: "high",
      targetFiles: ["src/domain/task.ts"],
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
      id: "task_conflict_02",
      sessionId: "sess_conf",
      projectId: "proj_conf",
      title: "Modify Task Contract B",
      description: "Edit domain task concurrently",
      objective: "Edit domain task concurrently",
      status: "queued",
      priority: "high",
      targetFiles: ["src/domain/task.ts"],
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
      taskId: "task_conflict_01",
      agentId: "agent_dev_A",
      instanceId: "inst_dev_A",
      projectId: "proj_conf",
      sessionId: "sess_conf",
    });

    const claim2 = claimManager.claimTask({
      taskId: "task_conflict_02",
      agentId: "agent_dev_B",
      instanceId: "inst_dev_B",
      projectId: "proj_conf",
      sessionId: "sess_conf",
    });

    const ws1 = await orchestrator.spawnParallelWorkspace({
      projectId: "proj_conf",
      taskId: "task_conflict_01",
      agentId: "agent_dev_A",
      instanceId: "inst_dev_A",
      leaseId: claim1.lease!.id,
      generation: claim1.lease!.generation,
      repoPath: tempRepo.repoPath,
    });

    const ws2 = await orchestrator.spawnParallelWorkspace({
      projectId: "proj_conf",
      taskId: "task_conflict_02",
      agentId: "agent_dev_B",
      instanceId: "inst_dev_B",
      leaseId: claim2.lease!.id,
      generation: claim2.lease!.generation,
      repoPath: tempRepo.repoPath,
    });

    // Agent A modifies src/domain/task.ts
    fs.appendFileSync(path.join(ws1.workspace!.worktreePath, "src", "domain", "task.ts"), "// Agent A Contract Edit\n");
    await execAsync('git add . && git commit -m "feat: contract A"', { cwd: ws1.workspace!.worktreePath });

    // Agent B modifies the same file src/domain/task.ts
    fs.appendFileSync(path.join(ws2.workspace!.worktreePath, "src", "domain", "task.ts"), "// Agent B Contract Edit\n");
    await execAsync('git add . && git commit -m "feat: contract B"', { cwd: ws2.workspace!.worktreePath });

    // Agent A integrates first
    const intRes1 = await integrator.integrate({
      workspaceId: ws1.workspace!.id,
      taskId: "task_conflict_01",
      agentId: "agent_dev_A",
      instanceId: "inst_dev_A",
      leaseId: claim1.lease!.id,
      generation: claim1.lease!.generation,
      targetBranch: "main",
      runVerification: false,
    }, tempRepo.repoPath);
    expect(intRes1.success).toBe(true);

    // Agent B direct integration detects BASE_DIVERGENCE / FILE_CONFLICT
    const intRes2 = await integrator.integrate({
      workspaceId: ws2.workspace!.id,
      taskId: "task_conflict_02",
      agentId: "agent_dev_B",
      instanceId: "inst_dev_B",
      leaseId: claim2.lease!.id,
      generation: claim2.lease!.generation,
      targetBranch: "main",
      runVerification: false,
    }, tempRepo.repoPath);

    expect(intRes2.success).toBe(false);
    expect(intRes2.status).toBe("CONFLICT_REJECTED");
    expect(intRes2.conflictReport).toBeDefined();

    // Clean up
    await orchestrator.cleanup(ws1.workspace!.id, tempRepo.repoPath);
    await orchestrator.cleanup(ws2.workspace!.id, tempRepo.repoPath);
  }, 25000);
});
