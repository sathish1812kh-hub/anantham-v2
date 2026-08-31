import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { LeaseRepository } from "../../src/persistence/repositories/lease-repository.js";
import { JobRepository } from "../../src/persistence/repositories/job-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";
import { BackgroundJobManager } from "../../src/jobs/background-job-manager.js";

describe("P7.3 Background Job — Creation & Full Lifecycle", () => {
  let engine: SqliteEngine;
  let jobRepo: JobRepository;
  let taskRepo: TaskRepository;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let leaseRepo: LeaseRepository;
  let eventStore: EventStore;
  let claimManager: TaskClaimManager;
  let jobManager: BackgroundJobManager;

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
    eventStore = new EventStore(engine);

    projectRepo.save({
      id: "proj_01",
      name: "Background Test Project",
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

    sessionRepo.save({
      id: "sess_01",
      projectId: "proj_01",
      name: "Background Session",
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

    claimManager = new TaskClaimManager({
      engine,
      taskRepo,
      leaseRepo,
      eventStore,
    });

    jobManager = new BackgroundJobManager({
      jobRepo,
      taskRepo,
      projectRepo,
      sessionRepo,
      claimManager,
      eventStore,
    });
  });

  afterEach(() => {
    engine.close();
  });

  it("creates, claims, heartbeats, and completes a background job cleanly", () => {
    // 1. Create Job
    const job = jobManager.createJob({
      projectId: "proj_01",
      sessionId: "sess_01",
      objective: "Analyze large dataset asynchronously",
      agentId: "agent_data",
      timeoutMs: 30000,
    });

    expect(job.status).toBe("QUEUED");
    expect(job.attempt).toBe(0);
    expect(job.taskId).toBeDefined();

    // Verify underlying task was created in TaskRepository
    const task = taskRepo.findById(job.taskId);
    expect(task).toBeDefined();
    expect(task?.objective).toBe("Analyze large dataset asynchronously");

    // 2. Claim Job
    const { job: runningJob, lease } = jobManager.claimJob(job.id, {
      agentId: "agent_data",
      instanceId: "inst_worker_1",
      ttlMs: 10000,
    });

    expect(runningJob.status).toBe("RUNNING");
    expect(runningJob.attempt).toBe(1);
    expect(runningJob.leaseId).toBe(lease.id);
    expect(runningJob.generation).toBe(1);

    // 3. Heartbeat Job
    const hbRes = jobManager.heartbeatJob(job.id, lease.id, lease.generation, {
      agentId: "agent_data",
      instanceId: "inst_worker_1",
    });

    expect(hbRes.success).toBe(true);
    expect(hbRes.lease?.renewalCount).toBe(1);

    // 4. Complete Job
    const completedJob = jobManager.completeJob(job.id, lease.id, lease.generation, {
      artifacts: ["art_analysis_report_01"],
      data: { rowsProcessed: 100000 },
      tokensUsed: 450,
      costUsd: 0.0045,
    });

    expect(completedJob.status).toBe("COMPLETED");
    expect(completedJob.completedAt).toBeDefined();
    expect(completedJob.resultArtifacts).toContain("art_analysis_report_01");
    expect(completedJob.consumption.tokens).toBe(450);

    // Verify underlying task is completed and lease released
    const completedTask = taskRepo.findById(job.taskId);
    expect(completedTask?.status).toBe("completed");

    const updatedLease = leaseRepo.findById(lease.id);
    expect(updatedLease?.status).toBe("RELEASED");
  });
});
