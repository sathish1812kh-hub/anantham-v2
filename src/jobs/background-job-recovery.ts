import { randomUUID } from "node:crypto";
import { type BackgroundJob, type JobStatus } from "../domain/job.js";
import { EventTypes } from "../domain/event.js";
import { EventStore } from "../event-state/event-store.js";
import { JobRepository } from "../persistence/repositories/job-repository.js";
import { TaskClaimManager } from "../tasks/task-claim-manager.js";

export interface ReconciledJobSummary {
  jobId: string;
  previousStatus: JobStatus;
  newStatus: JobStatus;
  reclaimedLeaseId?: string;
  checkpointId?: string;
  reconciledAt: string;
}

/**
 * Background Job Post-Crash Recovery & Orphan Reconciler.
 * Reconciles interrupted jobs and stale leases across system crashes or restarts.
 * PRD Part 1 Section 50–54 & PRD Part 2 Section 120–135.
 */
export class BackgroundJobRecoveryReconciler {
  constructor(
    private readonly jobRepo: JobRepository,
    private readonly claimManager: TaskClaimManager,
    private readonly eventStore?: EventStore
  ) {}

  /**
   * Scan and reconcile all uncompleted background jobs.
   */
  public reconcileActiveJobs(projectId?: string): ReconciledJobSummary[] {
    const activeJobs = this.jobRepo.listActiveJobs(projectId);
    const summaries: ReconciledJobSummary[] = [];

    for (const job of activeJobs) {
      const summary = this.reconcileSingleJob(job);
      summaries.push(summary);
    }

    return summaries;
  }

  /**
   * Reconcile a single interrupted background job.
   */
  public reconcileSingleJob(job: BackgroundJob): ReconciledJobSummary {
    const previousStatus = job.status;
    const now = new Date().toISOString();
    let newStatus: JobStatus = job.status;
    const reclaimedLeaseId = job.leaseId;

    if (job.status === "RUNNING" || job.status === "CLAIMING" || job.status === "COMPLETING") {
      // Release orphaned lease
      if (job.leaseId && job.generation) {
        this.claimManager.releaseTask(job.taskId, job.leaseId, job.generation, "CRASH_RECOVERY");
      }

      if (job.attempt >= job.maxAttempts) {
        newStatus = "FAILED";
        job.status = "FAILED";
        job.completedAt = now;
        job.errorMessage = "Interrupted by process crash and max retry attempts exhausted.";
      } else {
        newStatus = "RECOVERY_REQUIRED";
        job.status = "RECOVERY_REQUIRED";
        job.errorMessage = "Interrupted by process crash or worker loss. Reconciled for restart.";
      }

      job.leaseId = undefined;
      job.generation = undefined;
      this.jobRepo.saveJob(job);

      if (this.eventStore) {
        this.eventStore.append({
          id: randomUUID(),
          schemaVersion: 1,
          actor: "system",
          timestamp: now,
          type: EventTypes.JOB_RECOVERY_REQUIRED,
          projectId: job.projectId,
          sessionId: job.sessionId,
          payload: {
            jobId: job.id,
            previousStatus,
            newStatus,
            checkpointId: job.checkpointId,
            reason: job.errorMessage,
          },
        });
        this.eventStore.append({
          id: randomUUID(),
          schemaVersion: 1,
          actor: "system",
          timestamp: now,
          type: EventTypes.JOB_RECLAIMED,
          projectId: job.projectId,
          sessionId: job.sessionId,
          payload: {
            jobId: job.id,
            reclaimedLeaseId,
          },
        });
      }
    } else if (job.status === "CANCEL_REQUESTED") {
      newStatus = "CANCELLED";
      job.status = "CANCELLED";
      job.completedAt = now;
      if (job.leaseId && job.generation) {
        this.claimManager.releaseTask(job.taskId, job.leaseId, job.generation, "CANCEL_RECONCILED");
      }
      this.jobRepo.saveJob(job);
    }

    return {
      jobId: job.id,
      previousStatus,
      newStatus,
      reclaimedLeaseId,
      checkpointId: job.checkpointId,
      reconciledAt: now,
    };
  }
}
