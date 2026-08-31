import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { allMigrations } from "../../src/persistence/migrations/001_initial_core_schema.js";
import { WorkflowRepository } from "../../src/persistence/repositories/workflow-repository.js";
import { WorkflowRegistry } from "../../src/workflow/workflow-registry.js";
import { defineWorkflow, task } from "../../src/workflow/workflow-dsl.js";

import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";

describe("P7.1 Workflow Registry — Scoped Hierarchy Precedence & Version Pinning", () => {
  let engine: SqliteEngine;
  let workflowRepo: WorkflowRepository;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let registry: WorkflowRegistry;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    projectRepo = new ProjectRepository(engine);
    sessionRepo = new SessionRepository(engine);
    workflowRepo = new WorkflowRepository(engine);
    registry = new WorkflowRegistry({ workflowRepo });

    projectRepo.save({
      id: "proj_01",
      name: "Test Project",
      rootPath: "/test",
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
  });

  afterEach(() => {
    engine.close();
  });

  it("resolves workflows obeying scope precedence: project > profile > global > built-in", () => {
    // 1. Register built-in workflow
    const builtInWf = defineWorkflow({
      id: "wf_builtin",
      name: "deploy-pipeline",
      version: "1.0.0",
      scope: "built-in",
      tasks: [task("builtin_step", { agentId: "agent_builtin" })],
    });
    registry.register(builtInWf);

    // 2. Register global workflow
    const globalWf = defineWorkflow({
      id: "wf_global",
      name: "deploy-pipeline",
      version: "1.0.0",
      scope: "global",
      tasks: [task("global_step", { agentId: "agent_global" })],
    });
    registry.register(globalWf);

    // Without project scope, global takes precedence over built-in
    const resolvedGlobal = registry.resolve("deploy-pipeline");
    expect(resolvedGlobal?.id).toBe("wf_global");
    expect(resolvedGlobal?.scope).toBe("global");

    // 3. Register project workflow
    const projectWf = defineWorkflow({
      id: "wf_project",
      projectId: "proj_01",
      name: "deploy-pipeline",
      version: "1.0.0",
      scope: "project",
      tasks: [task("project_step", { agentId: "agent_project" })],
    });
    registry.register(projectWf);

    // With project scope, project takes precedence over global and built-in
    const resolvedProject = registry.resolve("deploy-pipeline", { projectId: "proj_01" });
    expect(resolvedProject?.id).toBe("wf_project");
    expect(resolvedProject?.scope).toBe("project");
  });

  it("creates immutable pinned versions snapshot for active workflow run", () => {
    const wf = defineWorkflow({
      id: "wf_versioned",
      name: "versioned-pipeline",
      version: "2.4.1",
      tasks: [task("build", { agentId: "agent_build" })],
    });
    registry.register(wf);

    // Seed session
    sessionRepo.save({
      id: "sess_01",
      projectId: "proj_01",
      name: "Test Session",
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

    const run = registry.createWorkflowRun(wf, "sess_01", {
      pluginVersions: { "git-plugin": "1.0.4" },
      skillVersions: { "tdd-skill": "2.1.0" },
      agentVersions: { "agent_build": "1.0.0" },
      modelProfile: "claude-3-5-sonnet",
    });

    expect(run.status).toBe("QUEUED");
    expect(run.pinnedVersions.workflowVersion).toBe("2.4.1");
    expect(run.pinnedVersions.pluginVersions["git-plugin"]).toBe("1.0.4");
    expect(run.pinnedVersions.skillVersions["tdd-skill"]).toBe("2.1.0");
    expect(run.pinnedVersions.modelProfile).toBe("claude-3-5-sonnet");

    // Verify stored in SQLite repository
    const retrieved = workflowRepo.findWorkflowRunById(run.id);
    expect(retrieved?.id).toBe(run.id);
    expect(retrieved?.pinnedVersions.workflowVersion).toBe("2.4.1");
  });
});
