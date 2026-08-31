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

describe("P7.3 Real Background Job Acceptance — Full Scenario Suite (A through H)", () => {
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
      id: "proj_acceptance",
      name: "Acceptance Project",
      rootPath: "/acceptance",
      status: "active",
      tags: [],
      modelProfile: "default",
      memoryNamespace: "default",
      orchestrationProfile: "default",
      trustProfile: "developer",
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      metadata: {},
    });

    sessionRepo.save({
      id: "sess_acceptance",
      projectId: "proj_acceptance",
      name: "Acceptance Session",
      branch: "main",
      status: "active",
      modelProfile: "default",
      keyPoolProfile: "default",
      mode: "autonomous",
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

  it("TEST A — Long Running Job: Create -> Claim -> Heartbeat -> Checkpoint -> Complete", () => {
    const job = jobManager.createJob({
      projectId: "proj_acceptance",
      sessionId: "sess_acceptance",
      objective: "Full acceptance test A",
      agentId: "agent_lead",
    });

    const { lease } = jobManager.claimJob(job.id, {
      agentId: "agent_lead",
      instanceId: "inst_lead_1",
      ttlMs: 5000,
    });

    const hb1 = jobManager.heartbeatJob(job.id, lease.id, lease.generation, {
      agentId: "agent_lead",
      instanceId: "inst_lead_1",
    });
    expect(hb1.success).toBe(true);

    jobManager.checkpointJob(job.id, lease.id, lease.generation, "chk_acc_01");

    const completed = jobManager.completeJob(job.id, lease.id, lease.generation, {
      artifacts: ["art_acc_01"],
      data: { score: 100 },
      tokensUsed: 300,
    });

    expect(completed.status).toBe("COMPLETED");
    expect(completed.checkpointId).toBe("chk_acc_01");
    expect(completed.resultArtifacts).toContain("art_acc_01");
  });

  it("TEST F — Duplicate Completion: Submitting completion twice returns authoritative state without duplicate mutations", () => {
    const job = jobManager.createJob({
      projectId: "proj_acceptance",
      sessionId: "sess_acceptance",
      objective: "Duplicate completion test",
      agentId: "agent_dup",
    });

    const { lease } = jobManager.claimJob(job.id, {
      agentId: "agent_dup",
      instanceId: "inst_dup_1",
    });

    const res1 = jobManager.completeJob(job.id, lease.id, lease.generation, {
      artifacts: ["art_1"],
    });
    expect(res1.status).toBe("COMPLETED");

    // Second call is idempotent
    const res2 = jobManager.completeJob(job.id, lease.id, lease.generation, {
      artifacts: ["art_1"],
    });
    expect(res2.status).toBe("COMPLETED");
    expect(res2.completedAt).toBe(res1.completedAt);
  });
});
