import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { CheckpointRepository } from "../../src/persistence/repositories/checkpoint-repository.js";
import { ArtifactRepository } from "../../src/persistence/repositories/artifact-repository.js";
import { EventRepository } from "../../src/persistence/repositories/event-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { ProjectionManager } from "../../src/event-state/projections/projection-manager.js";
import { LeaseManager } from "../../src/recovery/lease-manager.js";
import { CheckpointManifestBuilder } from "../../src/recovery/checkpoint-manifest.js";
import { SessionResumeEngine } from "../../src/resume/session-resume-engine.js";
import { EventTypes } from "../../src/domain/event.js";

describe("P1.5 Resume Subsystem — Real Disk Crash & Full State Reconstruction", () => {
  let tmpDir: string;
  let dbPath: string;
  let engine: SqliteEngine;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "anantham-disk-resume-"));
    dbPath = join(tmpDir, "resume-crash-test.db");
    engine = new SqliteEngine({ path: dbPath });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();
  });

  afterEach(() => {
    if (engine.isOpen) {
      engine.close();
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("simulates abnormal disk termination and performs full /resume reconstruction", async () => {
    const projectRepo = new ProjectRepository(engine);
    const sessionRepo = new SessionRepository(engine);
    const taskRepo = new TaskRepository(engine);
    const checkpointRepo = new CheckpointRepository(engine);
    const artifactRepo = new ArtifactRepository(engine);
    const eventStore = new EventStore(engine);

    // 1. Seed durable state
    projectRepo.save({
      id: "proj_prod_01",
      name: "Autonomous Analytics",
      rootPath: "/analytics",
      status: "active",
      tags: ["ml", "pipeline"],
      modelProfile: "claude-3-5-sonnet",
      memoryNamespace: "project/analytics",
      orchestrationProfile: "default",
      trustProfile: "developer",
      createdAt: "2026-08-30T21:00:00.000Z",
      lastOpenedAt: "2026-08-30T21:00:00.000Z",
      lastActivityAt: "2026-08-30T21:00:00.000Z",
    });

    sessionRepo.save({
      id: "sess_prod_01",
      projectId: "proj_prod_01",
      name: "ETL Pipeline Run",
      branch: "main",
      status: "active",
      modelProfile: "claude-3-5-sonnet",
      keyPoolProfile: "default",
      mode: "interactive",
      permissions: { "filesystem.read": true, "filesystem.write": true },
      createdAt: "2026-08-30T21:00:00.000Z",
      updatedAt: "2026-08-30T21:00:00.000Z",
    });

    // Seed tasks (t1 completed, t2 running during crash, t3 blocked on t2)
    taskRepo.save({
      id: "task_etl_01",
      projectId: "proj_prod_01",
      sessionId: "sess_prod_01",
      objective: "Extract data sources",
      status: "completed",
      priority: "high",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: "2026-08-30T21:00:00.000Z",
      updatedAt: "2026-08-30T21:00:00.000Z",
    });

    taskRepo.save({
      id: "task_etl_02",
      projectId: "proj_prod_01",
      sessionId: "sess_prod_01",
      objective: "Transform records",
      status: "running",
      priority: "high",
      dependencies: ["task_etl_01"],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: "2026-08-30T21:00:01.000Z",
      updatedAt: "2026-08-30T21:00:01.000Z",
    });

    taskRepo.save({
      id: "task_etl_03",
      projectId: "proj_prod_01",
      sessionId: "sess_prod_01",
      objective: "Load into data warehouse",
      status: "queued",
      priority: "critical",
      dependencies: ["task_etl_02"],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: "2026-08-30T21:00:02.000Z",
      updatedAt: "2026-08-30T21:00:02.000Z",
    });

    // Seed events
    eventStore.append({
      id: "evt_etl_01",
      schemaVersion: 1,
      projectId: "proj_prod_01",
      sessionId: "sess_prod_01",
      type: EventTypes.SESSION_CREATED,
      actor: "user",
      payload: { name: "ETL Pipeline Run" },
      timestamp: "2026-08-30T21:00:00.000Z",
    });

    eventStore.append({
      id: "evt_etl_02",
      schemaVersion: 1,
      projectId: "proj_prod_01",
      sessionId: "sess_prod_01",
      taskId: "task_etl_01",
      type: EventTypes.TASK_COMPLETED,
      actor: "agent",
      payload: {},
      timestamp: "2026-08-30T21:00:01.000Z",
    });

    eventStore.append({
      id: "evt_etl_03",
      schemaVersion: 1,
      projectId: "proj_prod_01",
      sessionId: "sess_prod_01",
      taskId: "task_etl_02",
      type: "approval.requested",
      actor: "agent",
      payload: {
        approvalId: "app_load_warehouse",
        action: "warehouse:write",
        riskLevel: "critical",
      },
      timestamp: "2026-08-30T21:00:02.000Z",
    });

    const chk = CheckpointManifestBuilder.createCheckpoint({
      projectId: "proj_prod_01",
      sessionId: "sess_prod_01",
      type: "automatic",
      eventOffset: 3,
    });
    checkpointRepo.save(chk);

    // 2. Abruptly close engine simulating process termination
    engine.close();

    // 3. Re-open database from disk on fresh process startup
    const freshEngine = new SqliteEngine({ path: dbPath });
    freshEngine.open();

    const freshProjectRepo = new ProjectRepository(freshEngine);
    const freshSessionRepo = new SessionRepository(freshEngine);
    const freshTaskRepo = new TaskRepository(freshEngine);
    const freshCheckpointRepo = new CheckpointRepository(freshEngine);
    const freshArtifactRepo = new ArtifactRepository(freshEngine);
    const freshEventRepo = new EventRepository(freshEngine);
    const freshEventStore = new EventStore(freshEngine);
    const freshProjectionManager = new ProjectionManager(freshEventStore);
    const freshLeaseManager = new LeaseManager({ taskRepo: freshTaskRepo });

    const resumeEngine = new SessionResumeEngine({
      engine: freshEngine,
      projectRepo: freshProjectRepo,
      sessionRepo: freshSessionRepo,
      taskRepo: freshTaskRepo,
      checkpointRepo: freshCheckpointRepo,
      artifactRepo: freshArtifactRepo,
      eventRepo: freshEventRepo,
      eventStore: freshEventStore,
      projectionManager: freshProjectionManager,
      leaseManager: freshLeaseManager,
    });

    // 4. Execute /resume
    const resumeResult = await resumeEngine.resume({ target: { type: "last" } });

    expect(resumeResult.success).toBe(true);
    expect(resumeResult.sessionId).toBe("sess_prod_01");
    expect(resumeResult.project.name).toBe("Autonomous Analytics");
    expect(resumeResult.checkpoint?.id).toBe(chk.id);

    // Task DAG verification: t1 is completed, t2 was running -> recovered to queued, t3 is blocked on t2
    expect(resumeResult.taskDAG.completedTasks.some((t) => t.id === "task_etl_01")).toBe(true);
    expect(resumeResult.taskDAG.queuedTasks.some((t) => t.id === "task_etl_02")).toBe(true);
    expect(resumeResult.taskDAG.blockedTasks.some((t) => t.id === "task_etl_03")).toBe(true);
    expect(resumeResult.taskDAG.executionOrder).toEqual(["task_etl_01", "task_etl_02", "task_etl_03"]);

    // Pending Approvals verification
    expect(resumeResult.pendingApprovals.pendingApprovalsCount).toBe(1);
    expect(resumeResult.pendingApprovals.approvals[0].approvalId).toBe("app_load_warehouse");
    expect(resumeResult.pendingApprovals.approvals[0].riskLevel).toBe("critical");

    // Projections rebuild verification
    const taskBoard = freshProjectionManager.taskBoard.getState("sess_prod_01");
    expect(taskBoard?.completed.some((t) => t.taskId === "task_etl_01")).toBe(true);

    freshEngine.close();
  });
});
