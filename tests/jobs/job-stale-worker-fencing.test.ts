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

describe("P7.3 Background Job — Stale Worker Generation Fencing", () => {
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

  it("rejects completion and heartbeats from a stale worker presenting an outdated generation token", () => {
    // 1. Create Job
    const job = jobManager.createJob({
      projectId: "proj_01",
      sessionId: "sess_01",
      objective: "Fenced job processing",
      agentId: "agent_worker_A",
    });

    // 2. Worker A claims job -> acquires lease gen=1
    const { lease: leaseA } = jobManager.claimJob(job.id, {
      agentId: "agent_worker_A",
      instanceId: "inst_A",
      ttlMs: 50, // Short TTL to simulate expiration
    });

    expect(leaseA.generation).toBe(1);

    // 3. Lease A expires
    leaseRepo.updateStatus(leaseA.id, "EXPIRED");
    taskRepo.updateStatus(job.taskId, "available");

    // Reset job status to QUEUED so Worker B can claim
    const jobRecord = jobRepo.findJobById(job.id)!;
    jobRecord.status = "QUEUED";
    jobRepo.saveJob(jobRecord);

    // 4. Worker B claims job -> acquires lease gen=2
    const { lease: leaseB } = jobManager.claimJob(job.id, {
      agentId: "agent_worker_B",
      instanceId: "inst_B",
      ttlMs: 10000,
    });

    expect(leaseB.generation).toBe(2);

    // 5. Stale Worker A attempts to send heartbeat with gen=1 -> MUST BE REJECTED
    const staleHeartbeat = jobManager.heartbeatJob(job.id, leaseA.id, 1, {
      agentId: "agent_worker_A",
      instanceId: "inst_A",
    });

    expect(staleHeartbeat.success).toBe(false);
    expect(staleHeartbeat.reason).toContain("FENCING_VIOLATION");

    // 6. Stale Worker A attempts to complete job with gen=1 -> MUST BE REJECTED
    expect(() => {
      jobManager.completeJob(job.id, leaseA.id, 1, { data: { forged: true } });
    }).toThrow("FENCING_VIOLATION");

    // 7. Legitimate Worker B completes job with gen=2 -> SUCCEEDS
    const completedJob = jobManager.completeJob(job.id, leaseB.id, 2, {
      data: { legitimate: true },
    });

    expect(completedJob.status).toBe("COMPLETED");
    expect(completedJob.resultData).toEqual({ legitimate: true });
  });
});
