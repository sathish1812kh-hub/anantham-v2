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

describe("P7.3 Background Job — Retry Semantics & Failure Classification", () => {
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

  it("retries transient rate limit failures and requeues job for next attempt", () => {
    const job = jobManager.createJob({
      projectId: "proj_01",
      sessionId: "sess_01",
      objective: "API scraping job",
      agentId: "agent_scraper",
      maxAttempts: 3,
    });

    const { lease } = jobManager.claimJob(job.id, {
      agentId: "agent_scraper",
      instanceId: "inst_1",
    });

    // Inject transient error 429
    const failRes = jobManager.failJob(
      job.id,
      lease.id,
      lease.generation,
      new Error("Rate limit 429: Too many requests")
    );

    expect(failRes.retrying).toBe(true);
    expect(failRes.status).toBe("QUEUED");
    expect(failRes.classification).toBe("RATE_LIMIT");

    const requeuedJob = jobRepo.findJobById(job.id);
    expect(requeuedJob?.status).toBe("QUEUED");
    expect(requeuedJob?.attempt).toBe(1);
  });

  it("fails closed immediately without retries when policy denial occurs", () => {
    const job = jobManager.createJob({
      projectId: "proj_01",
      sessionId: "sess_01",
      objective: "Restricted operation",
      agentId: "agent_restricted",
      maxAttempts: 5,
    });

    const { lease } = jobManager.claimJob(job.id, {
      agentId: "agent_restricted",
      instanceId: "inst_1",
    });

    // Inject non-retryable policy denial
    const failRes = jobManager.failJob(
      job.id,
      lease.id,
      lease.generation,
      new Error("Policy denial: Execution blocked by security policy")
    );

    expect(failRes.retrying).toBe(false);
    expect(failRes.status).toBe("FAILED");
    expect(failRes.classification).toBe("POLICY_DENIAL");

    const failedJob = jobRepo.findJobById(job.id);
    expect(failedJob?.status).toBe("FAILED");
    expect(failedJob?.completedAt).toBeDefined();
    expect(failedJob?.errorMessage).toContain("Policy denial");
  });
});
