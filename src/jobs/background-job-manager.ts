import { randomUUID } from "node:crypto";
import {
  type BackgroundJob,
  type JobCreationRequest,
  type JobStatus,
  type JobFailureClassification,
  BackgroundJobSchema,
  JobCreationRequestSchema,
} from "../domain/job.js";
import { type TaskLease } from "../domain/lease.js";
import { EventTypes } from "../domain/event.js";
import { EventStore } from "../event-state/event-store.js";
import { JobRepository } from "../persistence/repositories/job-repository.js";
import { TaskRepository } from "../persistence/repositories/task-repository.js";
import { ProjectRepository } from "../persistence/repositories/project-repository.js";
import { SessionRepository } from "../persistence/repositories/session-repository.js";
import { TaskClaimManager } from "../tasks/task-claim-manager.js";
import { WorkflowRetryHandler } from "../workflow/workflow-retry-handler.js";
import { WorkflowBudgetTracker } from "../workflow/workflow-budget-tracker.js";

export interface BackgroundJobManagerOptions {
  jobRepo: JobRepository;
  taskRepo: TaskRepository;
  projectRepo: ProjectRepository;
  sessionRepo: SessionRepository;
  claimManager: TaskClaimManager;
  eventStore?: EventStore;
  retryHandler?: WorkflowRetryHandler;
}

/**
 * Authoritative Background Job Lifecycle Manager.
 * Orchestrates job creation, claims, generation-fenced heartbeats, checkpoints,
 * cancellation, timeouts, and completion.
 * PRD Part 2 Section 120–135.
 */
export class BackgroundJobManager {
  private readonly jobRepo: JobRepository;
  private readonly taskRepo: TaskRepository;
  private readonly projectRepo: ProjectRepository;
  private readonly sessionRepo: SessionRepository;
  private readonly claimManager: TaskClaimManager;
  private readonly eventStore?: EventStore;
  private readonly retryHandler: WorkflowRetryHandler;

  constructor(options: BackgroundJobManagerOptions) {
    this.jobRepo = options.jobRepo;
    this.taskRepo = options.taskRepo;
    this.projectRepo = options.projectRepo;
    this.sessionRepo = options.sessionRepo;
    this.claimManager = options.claimManager;
    this.eventStore = options.eventStore;
    this.retryHandler = options.retryHandler ?? new WorkflowRetryHandler();
  }

  /**
   * Create and persist a new background job with an underlying durable task.
   */
  public createJob(request: JobCreationRequest): BackgroundJob {
    const validatedReq = JobCreationRequestSchema.parse(request);

    // 1. Verify project and session exist
    const project = this.projectRepo.findById(validatedReq.projectId);
    if (!project) {
      throw new Error(`Project "${validatedReq.projectId}" not found.`);
    }

    const session = this.sessionRepo.findById(validatedReq.sessionId);
    if (!session) {
      throw new Error(`Session "${validatedReq.sessionId}" not found.`);
    }

    const now = new Date().toISOString();
    const jobId = validatedReq.id || `job_${randomUUID()}`;
    const taskId = validatedReq.taskId || `task_${randomUUID()}`;

    // 2. Create underlying durable task if not exists
    let task = this.taskRepo.findById(taskId);
    if (!task) {
      task = {
        id: taskId,
        projectId: validatedReq.projectId,
        sessionId: validatedReq.sessionId,
        objective: validatedReq.objective,
        status: "available",
        priority: "normal",
        dependencies: [],
        inputArtifacts: [],
        outputArtifacts: [],
        createdAt: now,
        updatedAt: now,
        metadata: { jobId, ...validatedReq.metadata },
      };
      this.taskRepo.save(task);
    }

    // 3. Compute deadline if timeout is provided
    let deadline: string | undefined;
    if (validatedReq.timeoutMs) {
      deadline = new Date(Date.now() + validatedReq.timeoutMs).toISOString();
    }

    // 4. Create durable BackgroundJob
    const job: BackgroundJob = BackgroundJobSchema.parse({
      id: jobId,
      projectId: validatedReq.projectId,
      sessionId: validatedReq.sessionId,
      taskId,
      workflowId: validatedReq.workflowId,
      runId: validatedReq.runId,
      agentId: validatedReq.agentId,
      instanceId: validatedReq.instanceId || `inst_${randomUUID()}`,
      status: "QUEUED",
      createdAt: now,
      deadline,
      attempt: 0,
      maxAttempts: validatedReq.maxAttempts || 3,
      budget: validatedReq.budget,
      consumption: { tokens: 0, costUsd: 0, durationMs: 0, toolCalls: 0 },
      resultArtifacts: [],
      metadata: validatedReq.metadata || {},
    });

    const committedEvents: any[] = [];
    this.jobRepo.sqliteEngine.transaction(() => {
      this.jobRepo.saveJob(job);
      const ev1 = this.createAndAppendEventInTx(EventTypes.JOB_CREATED, job, { objective: validatedReq.objective });
      if (ev1) committedEvents.push(ev1);
      const ev2 = this.createAndAppendEventInTx(EventTypes.JOB_QUEUED, job, {});
      if (ev2) committedEvents.push(ev2);
    });

    if (this.eventStore && committedEvents.length > 0) {
      this.eventStore.notifyCommitted(committedEvents);
    }

    return job;
  }

  /**
   * Worker claims a background job, acquiring an exclusive lease with a monotonic generation token.
   */
  public claimJob(
    jobId: string,
    worker: { agentId: string; instanceId: string; ttlMs?: number; maxRenewals?: number }
  ): { job: BackgroundJob; lease: TaskLease } {
    const job = this.jobRepo.findJobById(jobId);
    if (!job) {
      throw new Error(`Background job "${jobId}" not found.`);
    }

    if (job.status !== "QUEUED" && job.status !== "RECOVERY_REQUIRED") {
      throw new Error(`Cannot claim job "${jobId}" in status "${job.status}". Expected "QUEUED" or "RECOVERY_REQUIRED".`);
    }

    // Acquire exclusive lease via TaskClaimManager
    const claimRes = this.claimManager.claimTask({
      taskId: job.taskId,
      agentId: worker.agentId,
      instanceId: worker.instanceId,
      projectId: job.projectId,
      sessionId: job.sessionId,
      ttlMs: worker.ttlMs,
      maxRenewals: worker.maxRenewals,
    });

    if (!claimRes.success || !claimRes.lease) {
      throw new Error(`Failed to claim underlying task "${job.taskId}": ${claimRes.errorMessage || "Lease acquisition failed."}`);
    }

    const now = new Date().toISOString();
    job.status = "RUNNING";
    job.startedAt = job.startedAt || now;
    job.heartbeatAt = claimRes.lease.lastHeartbeatAt;
    job.leaseId = claimRes.lease.id;
    job.generation = claimRes.lease.generation; // Monotonic fencing token
    job.agentId = worker.agentId;
    job.instanceId = worker.instanceId;
    job.attempt = job.attempt + 1;

    const committedEvents: any[] = [];
    this.jobRepo.sqliteEngine.transaction(() => {
      this.jobRepo.saveJob(job);
      const ev1 = this.createAndAppendEventInTx(EventTypes.JOB_CLAIMED, job, {
        leaseId: claimRes.lease!.id,
        generation: claimRes.lease!.generation,
      });
      if (ev1) committedEvents.push(ev1);
      const ev2 = this.createAndAppendEventInTx(EventTypes.JOB_STARTED, job, {});
      if (ev2) committedEvents.push(ev2);
    });

    if (this.eventStore && committedEvents.length > 0) {
      this.eventStore.notifyCommitted(committedEvents);
    }

    return { job, lease: claimRes.lease! };
  }

  /**
   * Worker sends a periodic heartbeat. Fencing tokens and deadlines are strictly validated.
   */
  public heartbeatJob(
    jobId: string,
    leaseId: string,
    generation: number,
    worker: { agentId: string; instanceId: string }
  ): { success: boolean; lease?: TaskLease; cancelled?: boolean; timedOut?: boolean; reason?: string } {
    const job = this.jobRepo.findJobById(jobId);
    if (!job) {
      return { success: false, reason: `Job "${jobId}" not found.` };
    }

    // Check cancellation
    if (job.status === "CANCEL_REQUESTED" || job.status === "CANCELLED") {
      return { success: false, cancelled: true, reason: "Job cancellation has been requested." };
    }

    // Check execution deadline
    if (job.deadline && Date.now() > new Date(job.deadline).getTime()) {
      job.status = "TIMED_OUT";
      job.completedAt = new Date().toISOString();
      job.errorMessage = `Job exceeded execution deadline of ${job.deadline}.`;
      
      const committedEvents: any[] = [];
      this.jobRepo.sqliteEngine.transaction(() => {
        this.jobRepo.saveJob(job);
        const ev = this.createAndAppendEventInTx(EventTypes.JOB_TIMED_OUT, job, { deadline: job.deadline });
        if (ev) committedEvents.push(ev);
      });

      if (this.eventStore && committedEvents.length > 0) {
        this.eventStore.notifyCommitted(committedEvents);
      }

      return { success: false, timedOut: true, reason: job.errorMessage };
    }

    // Fencing token verification on job record
    if (job.leaseId !== leaseId || job.generation !== generation) {
      return {
        success: false,
        reason: `FENCING_VIOLATION: Provided lease (${leaseId}, gen: ${generation}) does not match active job lease (${job.leaseId}, gen: ${job.generation}).`,
      };
    }

    // Renew heartbeat via TaskClaimManager
    const renewRes = this.claimManager.heartbeat({
      leaseId,
      agentId: worker.agentId,
      instanceId: worker.instanceId,
      generation,
    });

    if (!renewRes.success || !renewRes.lease) {
      return { success: false, reason: renewRes.errorMessage || "Heartbeat renewal rejected." };
    }

    job.heartbeatAt = renewRes.lease.lastHeartbeatAt;

    const committedEvents: any[] = [];
    this.jobRepo.sqliteEngine.transaction(() => {
      this.jobRepo.saveJob(job);
      const ev = this.createAndAppendEventInTx(EventTypes.JOB_HEARTBEAT, job, {
        leaseId,
        generation,
        renewalCount: renewRes.lease!.renewalCount,
      });
      if (ev) committedEvents.push(ev);
    });


    if (this.eventStore && committedEvents.length > 0) {
      this.eventStore.notifyCommitted(committedEvents);
    }

    return { success: true, lease: renewRes.lease };
  }

  /**
   * Associates a progress checkpoint with the background job.
   */
  public checkpointJob(
    jobId: string,
    leaseId: string,
    generation: number,
    checkpointId: string
  ): void {
    const job = this.jobRepo.findJobById(jobId);
    if (!job) {
      throw new Error(`Job "${jobId}" not found.`);
    }

    if (job.leaseId !== leaseId || job.generation !== generation) {
      throw new Error(`FENCING_VIOLATION: Checkpoint rejected. Worker lease or generation mismatch.`);
    }

    job.checkpointId = checkpointId;

    const committedEvents: any[] = [];
    this.jobRepo.sqliteEngine.transaction(() => {
      this.jobRepo.saveJob(job);
      const ev = this.createAndAppendEventInTx(EventTypes.JOB_CHECKPOINTED, job, { checkpointId });
      if (ev) committedEvents.push(ev);
    });

    if (this.eventStore && committedEvents.length > 0) {
      this.eventStore.notifyCommitted(committedEvents);
    }
  }

  /**
   * Completes a background job. Fencing token is strictly validated.
   */
  public completeJob(
    jobId: string,
    leaseId: string,
    generation: number,
    result?: {
      artifacts?: string[];
      data?: unknown;
      tokensUsed?: number;
      costUsd?: number;
      durationMs?: number;
      toolCalls?: number;
    }
  ): BackgroundJob {
    const job = this.jobRepo.findJobById(jobId);
    if (!job) {
      throw new Error(`Job "${jobId}" not found.`);
    }

    if (job.status === "COMPLETED") {
      // Idempotent return
      return job;
    }

    if (job.leaseId !== leaseId || job.generation !== generation) {
      throw new Error(`FENCING_VIOLATION: Completion rejected. Worker lease or generation mismatch.`);
    }

    // Complete underlying task and release lease
    const success = this.claimManager.completeTask(job.taskId, leaseId, generation);
    if (!success) {
      throw new Error(`Failed to complete underlying task: lease verification failed.`);
    }

    const now = new Date().toISOString();
    job.status = "COMPLETED";
    job.completedAt = now;
    job.resultArtifacts = result?.artifacts || [];
    job.resultData = result?.data;

    if (result) {
      const tracker = new WorkflowBudgetTracker(job.budget);
      job.consumption = tracker.recordConsumption(job.consumption, {
        tokens: result.tokensUsed,
        costUsd: result.costUsd,
        durationMs: result.durationMs,
        toolCalls: result.toolCalls,
      });
    }

    const committedEvents: any[] = [];
    this.jobRepo.sqliteEngine.transaction(() => {
      this.jobRepo.saveJob(job);
      const ev = this.createAndAppendEventInTx(EventTypes.JOB_COMPLETED, job, {
        resultArtifacts: job.resultArtifacts,
        consumption: job.consumption,
      });
      if (ev) committedEvents.push(ev);
    });

    if (this.eventStore && committedEvents.length > 0) {
      this.eventStore.notifyCommitted(committedEvents);
    }

    return job;
  }

  /**
   * Fails a background job attempt. Retries if transient; fails closed immediately on policy denials.
   */
  public failJob(
    jobId: string,
    leaseId: string,
    generation: number,
    error: unknown
  ): { status: JobStatus; retrying: boolean; backoffMs?: number; classification: JobFailureClassification } {
    const job = this.jobRepo.findJobById(jobId);
    if (!job) {
      throw new Error(`Job "${jobId}" not found.`);
    }

    if (job.leaseId !== leaseId || job.generation !== generation) {
      throw new Error(`FENCING_VIOLATION: Failure report rejected. Worker lease or generation mismatch.`);
    }

    const retryDecision = this.retryHandler.evaluateRetry(error, job.attempt, job.maxAttempts);
    const classification = retryDecision.classification as JobFailureClassification;
    const now = new Date().toISOString();
    const errStr = error instanceof Error ? error.message : String(error);

    if (retryDecision.shouldRetry) {
      // Release lease for retry
      this.claimManager.releaseTask(job.taskId, leaseId, generation, "RETRY_TRIGGERED");

      job.status = "QUEUED";
      job.failureClassification = classification;
      job.errorMessage = errStr;

      const committedEvents: any[] = [];
      this.jobRepo.sqliteEngine.transaction(() => {
        this.jobRepo.saveJob(job);
        const ev = this.createAndAppendEventInTx(EventTypes.JOB_RETRYING, job, {
          attempt: job.attempt,
          maxAttempts: job.maxAttempts,
          backoffMs: retryDecision.backoffMs,
          classification,
        });
        if (ev) committedEvents.push(ev);
      });

      if (this.eventStore && committedEvents.length > 0) {
        this.eventStore.notifyCommitted(committedEvents);
      }

      return {
        status: "QUEUED",
        retrying: true,
        backoffMs: retryDecision.backoffMs,
        classification,
      };
    }

    // Non-retryable or attempts exhausted: Mark FAILED
    this.claimManager.failTask(job.taskId, leaseId, generation, errStr);

    job.status = "FAILED";
    job.completedAt = now;
    job.failureClassification = classification;
    job.errorMessage = errStr;

    const committedEvents: any[] = [];
    this.jobRepo.sqliteEngine.transaction(() => {
      this.jobRepo.saveJob(job);
      const ev = this.createAndAppendEventInTx(EventTypes.JOB_FAILED, job, {
        attempt: job.attempt,
        classification,
        error: job.errorMessage,
      });
      if (ev) committedEvents.push(ev);
    });

    if (this.eventStore && committedEvents.length > 0) {
      this.eventStore.notifyCommitted(committedEvents);
    }

    return {
      status: "FAILED",
      retrying: false,
      classification,
    };
  }

  /**
   * Cancel an active or queued background job.
   */
  public cancelJob(jobId: string, reason = "User cancellation", requestedBy = "user"): BackgroundJob {
    const job = this.jobRepo.findJobById(jobId);
    if (!job) {
      throw new Error(`Job "${jobId}" not found.`);
    }

    const terminalStatuses = ["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"];
    if (terminalStatuses.includes(job.status)) {
      return job;
    }

    const now = new Date().toISOString();
    job.status = "CANCELLED";
    job.completedAt = now;
    job.cancellationRequestedAt = now;
    job.cancellationReason = reason;

    if (job.leaseId && job.generation) {
      this.claimManager.releaseTask(job.taskId, job.leaseId, job.generation, reason);
    }

    const committedEvents: any[] = [];
    this.jobRepo.sqliteEngine.transaction(() => {
      this.jobRepo.saveJob(job);
      const ev1 = this.createAndAppendEventInTx(EventTypes.JOB_CANCEL_REQUESTED, job, { reason, requestedBy });
      if (ev1) committedEvents.push(ev1);
      const ev2 = this.createAndAppendEventInTx(EventTypes.JOB_CANCELLED, job, { reason, requestedBy });
      if (ev2) committedEvents.push(ev2);
    });

    if (this.eventStore && committedEvents.length > 0) {
      this.eventStore.notifyCommitted(committedEvents);
    }

    return job;
  }

  /**
   * Retrieve current live status of a background job.
   */
  public getJob(jobId: string): BackgroundJob | null {
    return this.jobRepo.findJobById(jobId);
  }

  private createAndAppendEventInTx(type: string, job: BackgroundJob, payload: Record<string, unknown>): any {
    if (!this.eventStore) return null;
    return this.eventStore.appendWithinTransaction({
      id: randomUUID(),
      schemaVersion: 1,
      actor: "system",
      timestamp: new Date().toISOString(),
      type,
      projectId: job.projectId,
      sessionId: job.sessionId,
      payload: {
        jobId: job.id,
        taskId: job.taskId,
        agentId: job.agentId,
        instanceId: job.instanceId,
        status: job.status,
        ...payload,
      },
    });
  }
}

