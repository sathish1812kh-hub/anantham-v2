import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SqliteEngine } from "../../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../../src/persistence/migration-engine.js";
import { WorkflowRepository } from "../../../src/persistence/repositories/workflow-repository.js";
import { ProjectRepository } from "../../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../../src/persistence/repositories/session-repository.js";
import { EventStore } from "../../../src/event-state/event-store.js";
import { WorkflowRegistry } from "../../../src/workflow/workflow-registry.js";
import { WorkflowRecoveryReconciler } from "../../../src/workflow/workflow-recovery-reconciler.js";
import { defineWorkflow, task, approve } from "../../../src/workflow/workflow-dsl.js";

describe("P7.2 Workflow Engine — Crash Recovery & Reconciler", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "anantham-wf-rec-"));
    dbPath = path.join(tmpDir, "recovery.db");
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("reconciles crashed running workflow, resets orphaned running tasks, and preserves WAITING_APPROVAL runs", async () => {
    // 1. Process 1: Setup DB, create running workflow and waiting approval workflow, then simulate abrupt crash
    {
      const engine1 = new SqliteEngine({ path: dbPath });
      engine1.open();
      const migrator1 = new MigrationEngine(engine1);
      migrator1.migrate();

      const projectRepo1 = new ProjectRepository(engine1);
      const sessionRepo1 = new SessionRepository(engine1);

      projectRepo1.save({
        id: "proj_rec",
        name: "Recovery Project",
        rootPath: "/path",
        status: "active",
        tags: [],
        modelProfile: "default",
        memoryNamespace: "default",
        orchestrationProfile: "default",
        trustProfile: "safe",
        createdAt: new Date().toISOString(),
        lastOpenedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        metadata: {},
      });

      sessionRepo1.save({
        id: "sess_rec",
        projectId: "proj_rec",
        name: "Session",
        branch: "main",
        status: "active",
        modelProfile: "default",
        keyPoolProfile: "default",
        mode: "interactive",
        permissions: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {},
      });

      const repo1 = new WorkflowRepository(engine1);
      const reg1 = new WorkflowRegistry({ workflowRepo: repo1 });

      const wf1 = defineWorkflow({
        id: "wf_crashed",
        projectId: "proj_rec",
        name: "crashed-wf",
        version: "1.0.0",
        tasks: [task("task_orphaned", { agentId: "agent_1" })],
      });
      reg1.register(wf1);

      const run1 = reg1.createWorkflowRun(wf1, "sess_rec");
      run1.status = "RUNNING";
      run1.runningTasks = ["task_orphaned"];
      run1.nodeStates["task_orphaned"] = { status: "RUNNING", attempts: 1 };
      repo1.saveWorkflowRun(run1);

      const wf2 = defineWorkflow({
        id: "wf_approval",
        projectId: "proj_rec",
        name: "approval-wf",
        version: "1.0.0",
        tasks: [
          approve("app_gate", "Please approve release"),
        ],
      });
      reg1.register(wf2);

      const run2 = reg1.createWorkflowRun(wf2, "sess_rec");
      run2.status = "WAITING_APPROVAL";
      run2.approvalGate = {
        nodeId: "app_gate",
        message: "Please approve release",
        requestedAt: new Date().toISOString(),
      };
      run2.nodeStates["app_gate"] = { status: "WAITING_APPROVAL", attempts: 1 };
      repo1.saveWorkflowRun(run2);

      engine1.close(); // Abrupt shutdown
    }

    // 2. Process 2: Reopen DB, run WorkflowRecoveryReconciler
    {
      const engine2 = new SqliteEngine({ path: dbPath });
      engine2.open();

      const eventStore2 = new EventStore(engine2);
      const repo2 = new WorkflowRepository(engine2);
      const reconciler = new WorkflowRecoveryReconciler(repo2, eventStore2);

      const summaries = await reconciler.reconcileActiveRuns("proj_rec");
      expect(summaries).toHaveLength(2);

      // Verify crashed run was reconciled and paused
      const recoveredRun1 = repo2.findWorkflowRunById(summaries.find((s) => s.previousStatus === "RUNNING")!.runId);
      expect(recoveredRun1?.status).toBe("PAUSED");
      expect(recoveredRun1?.runningTasks).toHaveLength(0);
      expect(recoveredRun1?.nodeStates["task_orphaned"]?.status).toBe("FAILED");
      expect(recoveredRun1?.nodeStates["task_orphaned"]?.error).toContain("Interrupted by process crash");

      // Verify approval run remained intact in WAITING_APPROVAL
      const recoveredRun2 = repo2.findWorkflowRunById(summaries.find((s) => s.previousStatus === "WAITING_APPROVAL")!.runId);
      expect(recoveredRun2?.status).toBe("WAITING_APPROVAL");
      expect(recoveredRun2?.approvalGate?.nodeId).toBe("app_gate");

      engine2.close();
    }
  });
});
