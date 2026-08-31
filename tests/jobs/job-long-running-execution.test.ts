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
import { BackgroundJobSupervisor } from "../../src/jobs/background-job-supervisor.js";

describe("P7.3 Background Job — Long Running Supervisor Execution", () => {
  let engine: SqliteEngine;
  let jobRepo: JobRepository;
  let taskRepo: TaskRepository;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let leaseRepo: LeaseRepository;
  let eventStore: EventStore;
  let claimManager: TaskClaimManager;
  let jobManager: BackgroundJobManager;
  let supervisor: BackgroundJobSupervisor;

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
      name: "Supervisor Project",
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
      name: "Supervisor Session",
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

    supervisor = new BackgroundJobSupervisor({
      jobManager,
      heartbeatIntervalMs: 20, // Fast heartbeats for testing
      maxConcurrentJobsPerProject: 3,
      maxConcurrentJobsGlobal: 10,
    });
  });

  afterEach(() => {
    engine.close();
  });

  it("executes a long-running job in supervisor with automated heartbeats and cleanly completes", async () => {
    const job = jobManager.createJob({
      projectId: "proj_01",
      sessionId: "sess_01",
      objective: "Background processing job",
      agentId: "agent_runner",
    });

    const completedJob = await supervisor.runJob(
      job.id,
      { agentId: "agent_runner", instanceId: "inst_run_1", ttlMs: 1000 },
      async (_activeJob, _abortSignal) => {
        // Simulate multi-step work
        await new Promise((r) => setTimeout(r, 60));
        return {
          artifacts: ["art_final_output_01"],
          data: { success: true },
          tokensUsed: 200,
          costUsd: 0.002,
        };
      }
    );

    expect(completedJob.status).toBe("COMPLETED");
    expect(completedJob.resultArtifacts).toContain("art_final_output_01");
    expect(completedJob.consumption.tokens).toBe(200);
    expect(supervisor.getActiveCount()).toBe(0);
  });
});
