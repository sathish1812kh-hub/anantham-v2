import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
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
import { BackgroundJobRecoveryReconciler } from "../../src/jobs/background-job-recovery.js";

describe("P7.3 Background Job — Crash Recovery & Orphan Reconciler", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "anantham-job-rec-"));
    dbPath = path.join(tmpDir, "jobs.db");
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("reconciles crashed running background jobs, releases orphaned leases, and preserves checkpoint evidence", () => {
    // 1. Process 1: Setup DB, create and claim job, associate checkpoint, simulate crash
    {
      const engine1 = new SqliteEngine({ path: dbPath });
      engine1.open();
      const migrator1 = new MigrationEngine(engine1);
      migrator1.migrate();

      const projectRepo1 = new ProjectRepository(engine1);
      const sessionRepo1 = new SessionRepository(engine1);
      const taskRepo1 = new TaskRepository(engine1);
      const leaseRepo1 = new LeaseRepository(engine1);
      const jobRepo1 = new JobRepository(engine1);
      const eventStore1 = new EventStore(engine1);

      projectRepo1.save({
        id: "proj_rec",
        name: "Recovery Project",
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

      sessionRepo1.save({
        id: "sess_rec",
        projectId: "proj_rec",
        name: "Recovery Session",
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

      const claimMgr1 = new TaskClaimManager({
        engine: engine1,
        taskRepo: taskRepo1,
        leaseRepo: leaseRepo1,
        eventStore: eventStore1,
      });

      const jobMgr1 = new BackgroundJobManager({
        jobRepo: jobRepo1,
        taskRepo: taskRepo1,
        projectRepo: projectRepo1,
        sessionRepo: sessionRepo1,
        claimManager: claimMgr1,
        eventStore: eventStore1,
      });

      const job = jobMgr1.createJob({
        projectId: "proj_rec",
        sessionId: "sess_rec",
        objective: "Crash recovery test job",
        agentId: "agent_crash",
      });

      const { lease } = jobMgr1.claimJob(job.id, {
        agentId: "agent_crash",
        instanceId: "inst_crash_1",
      });

      jobMgr1.checkpointJob(job.id, lease.id, lease.generation, "chk_progress_01");

      engine1.close(); // Simulate sudden crash
    }

    // 2. Process 2: Reopen DB and run BackgroundJobRecoveryReconciler
    {
      const engine2 = new SqliteEngine({ path: dbPath });
      engine2.open();

      const taskRepo2 = new TaskRepository(engine2);
      const leaseRepo2 = new LeaseRepository(engine2);
      const jobRepo2 = new JobRepository(engine2);
      const eventStore2 = new EventStore(engine2);

      const claimMgr2 = new TaskClaimManager({
        engine: engine2,
        taskRepo: taskRepo2,
        leaseRepo: leaseRepo2,
        eventStore: eventStore2,
      });

      const reconciler = new BackgroundJobRecoveryReconciler(jobRepo2, claimMgr2, eventStore2);
      const summaries = reconciler.reconcileActiveJobs("proj_rec");

      expect(summaries).toHaveLength(1);
      expect(summaries[0]?.previousStatus).toBe("RUNNING");
      expect(summaries[0]?.newStatus).toBe("RECOVERY_REQUIRED");
      expect(summaries[0]?.checkpointId).toBe("chk_progress_01");

      const reconciledJob = jobRepo2.findJobById(summaries[0]!.jobId);
      expect(reconciledJob?.status).toBe("RECOVERY_REQUIRED");
      expect(reconciledJob?.checkpointId).toBe("chk_progress_01");
      expect(reconciledJob?.leaseId).toBeUndefined(); // Orphaned lease cleared

      engine2.close();
    }
  });
});
