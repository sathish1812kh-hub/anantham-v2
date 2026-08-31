import { type BackgroundJob } from "../domain/job.js";
import { BackgroundJobManager } from "./background-job-manager.js";

export type BackgroundJobWorkerFn = (
  job: BackgroundJob,
  abortSignal: AbortSignal
) => Promise<{
  artifacts?: string[];
  data?: unknown;
  tokensUsed?: number;
  costUsd?: number;
  durationMs?: number;
  toolCalls?: number;
}>;

export interface BackgroundJobSupervisorOptions {
  jobManager: BackgroundJobManager;
  heartbeatIntervalMs?: number;
  maxConcurrentJobsPerProject?: number;
  maxConcurrentJobsGlobal?: number;
}

/**
 * Background Job Supervisor & Worker Pool.
 * Executes background tasks asynchronously, manages heartbeats, monitors deadlines,
 * and enforces project-level concurrency limits.
 * PRD Part 2 Section 120–135.
 */
export class BackgroundJobSupervisor {
  private readonly jobManager: BackgroundJobManager;
  private readonly heartbeatIntervalMs: number;
  private readonly maxConcurrentJobsPerProject: number;
  private readonly maxConcurrentJobsGlobal: number;

  private readonly activeJobs = new Map<string, { abortController: AbortController; projectId: string; timer?: NodeJS.Timeout }>();

  constructor(options: BackgroundJobSupervisorOptions) {
    this.jobManager = options.jobManager;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 5000;
    this.maxConcurrentJobsPerProject = options.maxConcurrentJobsPerProject ?? 5;
    this.maxConcurrentJobsGlobal = options.maxConcurrentJobsGlobal ?? 20;
  }

  /**
   * Check if project or global concurrency capacity is available.
   */
  public canAcceptJob(projectId: string): boolean {
    if (this.activeJobs.size >= this.maxConcurrentJobsGlobal) {
      return false;
    }
    let projectCount = 0;
    for (const info of this.activeJobs.values()) {
      if (info.projectId === projectId) projectCount++;
    }
    return projectCount < this.maxConcurrentJobsPerProject;
  }

  /**
   * Dispatch a background job for execution in the worker pool.
   */
  public async runJob(
    jobId: string,
    worker: { agentId: string; instanceId: string; ttlMs?: number },
    workerFn: BackgroundJobWorkerFn
  ): Promise<BackgroundJob> {
    const initialJob = this.jobManager.getJob(jobId);
    if (!initialJob) {
      throw new Error(`Job "${jobId}" not found.`);
    }

    if (!this.canAcceptJob(initialJob.projectId)) {
      throw new Error(`Concurrency limit reached for project "${initialJob.projectId}" or global worker pool.`);
    }

    // 1. Claim job and acquire generation-fenced lease
    const { job, lease } = this.jobManager.claimJob(jobId, worker);
    const abortController = new AbortController();

    const activeInfo: { abortController: AbortController; projectId: string; timer?: NodeJS.Timeout } = {
      abortController,
      projectId: job.projectId,
    };
    this.activeJobs.set(jobId, activeInfo);

    // 2. Start heartbeat timer
    const intervalId = setInterval(() => {
      const hbRes = this.jobManager.heartbeatJob(jobId, lease.id, lease.generation, worker);
      if (!hbRes.success) {
        if (hbRes.cancelled || hbRes.timedOut) {
          abortController.abort();
        }
        clearInterval(intervalId);
      }
    }, this.heartbeatIntervalMs);
    activeInfo.timer = intervalId;

    // 3. Execute worker function
    try {
      const result = await workerFn(job, abortController.signal);
      clearInterval(intervalId);
      this.activeJobs.delete(jobId);

      return this.jobManager.completeJob(jobId, lease.id, lease.generation, result);
    } catch (err: any) {
      clearInterval(intervalId);
      this.activeJobs.delete(jobId);

      if (abortController.signal.aborted) {
        return this.jobManager.cancelJob(jobId, "Aborted during execution due to timeout or cancellation signal.");
      }

      this.jobManager.failJob(jobId, lease.id, lease.generation, err);
      const updated = this.jobManager.getJob(jobId);
      return updated!;
    } finally {
      clearInterval(intervalId);
      this.activeJobs.delete(jobId);
    }
  }

  /**
   * Request abort for an active running job.
   */
  public abortActiveJob(jobId: string, reason = "Supervisor abort"): void {
    const active = this.activeJobs.get(jobId);
    if (active) {
      active.abortController.abort();
      if (active.timer) clearInterval(active.timer);
      this.activeJobs.delete(jobId);
    }
    this.jobManager.cancelJob(jobId, reason);
  }

  public getActiveCount(): number {
    return this.activeJobs.size;
  }
}
