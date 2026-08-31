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

describe("P7.3 Background Job — Timeout Enforcement", () => {
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

  it("transitions job to TIMED_OUT when execution deadline is exceeded during heartbeat", () => {
    const job = jobManager.createJob({
      projectId: "proj_01",
      sessionId: "sess_01",
      objective: "Quick task with tight deadline",
      agentId: "agent_quick",
      timeoutMs: 10, // 10ms deadline
    });

    const { lease } = jobManager.claimJob(job.id, {
      agentId: "agent_quick",
      instanceId: "inst_q",
      ttlMs: 5000,
    });

    // Artificially advance time past deadline
    const jobRecord = jobRepo.findJobById(job.id)!;
    jobRecord.deadline = new Date(Date.now() - 1000).toISOString();
    jobRepo.saveJob(jobRecord);

    const hbRes = jobManager.heartbeatJob(job.id, lease.id, lease.generation, {
      agentId: "agent_quick",
      instanceId: "inst_q",
    });

    expect(hbRes.success).toBe(false);
    expect(hbRes.timedOut).toBe(true);

    const timedOutJob = jobRepo.findJobById(job.id);
    expect(timedOutJob?.status).toBe("TIMED_OUT");
    expect(timedOutJob?.errorMessage).toContain("Job exceeded execution deadline");
  });
});
