import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { LeaseRepository } from "../../src/persistence/repositories/lease-repository.js";
import { JobRepository } from "../../src/persistence/repositories/job-repository.js";
import { DiagnosticInspector } from "../../src/observability/diagnostic-inspector.js";

import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";

describe("P8.5 Observability — Diagnostic Inspector & Health Diagnostics", () => {
  let engine: SqliteEngine;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let taskRepo: TaskRepository;
  let leaseRepo: LeaseRepository;
  let jobRepo: JobRepository;
  let inspector: DiagnosticInspector;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    projectRepo = new ProjectRepository(engine);
    sessionRepo = new SessionRepository(engine);
    taskRepo = new TaskRepository(engine);
    leaseRepo = new LeaseRepository(engine);
    jobRepo = new JobRepository(engine);

    projectRepo.save({
      id: "proj_diag",
      name: "Diag Project",
      rootPath: "/diag",
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

    sessionRepo.save({
      id: "sess_diag",
      projectId: "proj_diag",
      name: "Diag Session",
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

    inspector = new DiagnosticInspector({
      engine,
      taskRepo,
      leaseRepo,
      jobRepo,
    });
  });


  afterEach(() => {
    engine.close();
  });

  it("inspects healthy database and returns HEALTHY status with 0 anomalies", () => {
    const report = inspector.inspect();
    expect(report.status).toBe("HEALTHY");
    expect(report.sqliteIntegrity).toBe(true);
    expect(report.migrationsApplied).toBeGreaterThanOrEqual(9);
    expect(report.orphanedTasksCount).toBe(0);
  });

  it("detects orphaned in-progress task when lease is missing", () => {
    taskRepo.save({
      id: "task_orphan_test",
      projectId: "proj_diag",
      sessionId: "sess_diag",
      objective: "Orphaned task",
      status: "running",
      priority: "normal",

      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {},
    });

    const report = inspector.inspect();
    expect(report.status).toBe("DEGRADED");
    expect(report.orphanedTasksCount).toBe(1);
    expect(report.unresolvedAnomalies.length).toBeGreaterThanOrEqual(1);
  });
});
