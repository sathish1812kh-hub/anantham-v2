import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { allMigrations } from "../../src/persistence/migrations/001_initial_core_schema.js";
import { WorkflowRepository } from "../../src/persistence/repositories/workflow-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { WorkflowRegistry } from "../../src/workflow/workflow-registry.js";
import { defineWorkflow, task, parallel, verify } from "../../src/workflow/workflow-dsl.js";

import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";

describe("P7.1 Workflow Durability — SQLite WAL Persistence & Zero State Loss", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "anantham-wf-durability-"));
    dbPath = path.join(tmpDir, "workflow-durability.db");
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("persists workflow definitions and run states across a complete process restart", () => {
    // 1. Process 1: Setup DB, Migrations, Register Workflow, Start Run
    {
      const engine1 = new SqliteEngine({ path: dbPath });
      engine1.open();
      const migrator1 = new MigrationEngine(engine1);
      migrator1.migrate();

      const projectRepo1 = new ProjectRepository(engine1);
      const sessionRepo1 = new SessionRepository(engine1);

      projectRepo1.save({
        id: "proj_dur",
        name: "Durability Project",
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
        id: "sess_dur",
        projectId: "proj_dur",
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

      const eventStore1 = new EventStore(engine1);
      const repo1 = new WorkflowRepository(engine1);
      const registry1 = new WorkflowRegistry({ workflowRepo: repo1, eventStore: eventStore1 });

      const wf = defineWorkflow({
        id: "wf_durable_01",
        projectId: "proj_dur",
        name: "durable-pipeline",
        version: "1.0.0",
        tasks: [
          task("task1", { agentId: "agent_1" }),
          parallel("par_tasks", [
            task("p1", { agentId: "agent_p1" }),
            task("p2", { agentId: "agent_p2" }),
          ], { dependsOn: ["task1"] }),
          verify("v_gate", ["tests.pass == true"], { dependsOn: ["par_tasks"] }),
        ],
      });

      const regRes = registry1.register(wf);
      expect(regRes.success).toBe(true);

      const run = registry1.createWorkflowRun(wf, "sess_dur", {
        pluginVersions: { "git-plugin": "2.0.0" },
        skillVersions: { "test-skill": "1.0.0" },
        modelProfile: "claude-3-5-sonnet",
      });

      // Advance step
      run.status = "RUNNING";
      run.currentStepIndex = 1;
      run.completedTasks.push("task1");
      run.taskResults["task1"] = { output: "build_success" };
      repo1.saveWorkflowRun(run);

      engine1.close();
    }

    // 2. Process 2: Reopen DB, Reconstruct State, Verify Zero State Loss
    {
      const engine2 = new SqliteEngine({ path: dbPath });
      engine2.open();
      const repo2 = new WorkflowRepository(engine2);

      const reconstructedWf = repo2.findWorkflowById("wf_durable_01");
      expect(reconstructedWf).toBeDefined();
      expect(reconstructedWf?.name).toBe("durable-pipeline");
      expect(reconstructedWf?.tasks).toHaveLength(3);

      const runs = repo2.listWorkflowRunsBySession("sess_dur");
      expect(runs).toHaveLength(1);
      expect(runs[0]?.status).toBe("RUNNING");
      expect(runs[0]?.currentStepIndex).toBe(1);
      expect(runs[0]?.completedTasks).toContain("task1");
      expect(runs[0]?.taskResults["task1"]).toEqual({ output: "build_success" });
      expect(runs[0]?.pinnedVersions.workflowVersion).toBe("1.0.0");
      expect(runs[0]?.pinnedVersions.pluginVersions["git-plugin"]).toBe("2.0.0");

      engine2.close();
    }
  });
});
