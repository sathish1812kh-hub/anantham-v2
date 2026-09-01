import { randomUUID } from "node:crypto";
import {
  type WorkflowDefinition,
  type WorkflowRun,
} from "../domain/workflow.js";
import { EventTypes } from "../domain/event.js";
import { EventStore } from "../event-state/event-store.js";
import { WorkflowRepository } from "../persistence/repositories/workflow-repository.js";
import { WorkflowRegistry } from "./workflow-registry.js";
import { WorkflowExecutor, type TaskDispatcherFn } from "./workflow-executor.js";

export interface StartWorkflowOptions {
  projectId?: string;
  environmentContext?: {
    pluginVersions?: Record<string, string>;
    skillVersions?: Record<string, string>;
    agentVersions?: Record<string, string>;
    modelProfile?: string;
  };
  taskDispatcher?: TaskDispatcherFn;
}

export interface ApprovalInput {
  decision: "APPROVED" | "REJECTED";
  approverId?: string;
  notes?: string;
}

/**
 * Top-Level Workflow Orchestration Engine.
 * Manages the full lifecycle of workflows and active runs:
 * start, pause, resume, cancel, approval gates, and crash recovery.
 * PRD Part 2 Section 109–135.
 */
export class WorkflowEngine {
  private readonly workflowRepo: WorkflowRepository;
  private readonly registry: WorkflowRegistry;
  private readonly executor: WorkflowExecutor;
  private readonly eventStore?: EventStore;

  constructor(options: {
    workflowRepo: WorkflowRepository;
    registry: WorkflowRegistry;
    eventStore?: EventStore;
    taskDispatcher?: TaskDispatcherFn;
  }) {
    this.workflowRepo = options.workflowRepo;
    this.registry = options.registry;
    this.eventStore = options.eventStore;
    this.executor = new WorkflowExecutor({
      workflowRepo: this.workflowRepo,
      eventStore: this.eventStore,
      taskDispatcher: options.taskDispatcher,
    });
  }

  /**
   * Start and execute a new workflow run.
   */
  public async startWorkflow(
    workflowOrName: WorkflowDefinition | string,
    sessionId: string,
    options?: StartWorkflowOptions
  ): Promise<WorkflowRun> {
    let workflow: WorkflowDefinition | null;

    if (typeof workflowOrName === "string") {
      workflow =
        this.registry.resolve(workflowOrName, { projectId: options?.projectId }) ||
        this.registry.getById(workflowOrName);
      if (!workflow) {
        throw new Error(`Workflow "${workflowOrName}" could not be resolved in scope.`);
      }
    } else {
      workflow = workflowOrName;
      // Ensure registered
      if (!this.registry.getById(workflow.id)) {
        this.registry.register(workflow);
      }
    }

    // 1. Create durable run with pinned versions
    const run = this.registry.createWorkflowRun(
      workflow,
      sessionId,
      options?.environmentContext
    );

    // 2. Execute via WorkflowExecutor
    return this.executor.execute(run, workflow);
  }

  /**
   * Pause an active workflow run.
   */
  public async pauseWorkflow(runId: string, reason = "Workflow paused"): Promise<WorkflowRun> {
    const run = this.workflowRepo.findWorkflowRunById(runId);
    if (!run) {
      throw new Error(`Workflow run "${runId}" not found.`);
    }

    if (run.status !== "RUNNING" && run.status !== "QUEUED") {
      throw new Error(`Cannot pause workflow run in status "${run.status}".`);
    }

    run.status = "PAUSED";

    let committedEvent: any = null;
    this.workflowRepo.sqliteEngine.transaction(() => {
      this.workflowRepo.saveWorkflowRun(run);
      if (this.eventStore) {
        committedEvent = this.eventStore.appendWithinTransaction({
          id: randomUUID(),
          schemaVersion: 1,
          actor: "system",
          timestamp: new Date().toISOString(),
          type: EventTypes.WORKFLOW_PAUSED,
          projectId: run.projectId,
          sessionId: run.sessionId,
          payload: { runId, reason },
        });
      }
    });

    if (this.eventStore && committedEvent) {
      this.eventStore.notifyCommitted([committedEvent]);
    }

    return run;
  }

  /**
   * Resume a paused workflow run.
   */
  public async resumeWorkflow(runId: string): Promise<WorkflowRun> {
    const run = this.workflowRepo.findWorkflowRunById(runId);
    if (!run) {
      throw new Error(`Workflow run "${runId}" not found.`);
    }

    if (run.status !== "PAUSED" && run.status !== "WAITING_APPROVAL") {
      throw new Error(`Cannot resume workflow run in status "${run.status}".`);
    }

    const workflow = this.workflowRepo.findWorkflowById(run.workflowId);
    if (!workflow) {
      throw new Error(`Pinned workflow definition "${run.workflowId}" not found.`);
    }

    run.status = "RUNNING";

    let committedEvent: any = null;
    this.workflowRepo.sqliteEngine.transaction(() => {
      this.workflowRepo.saveWorkflowRun(run);
      if (this.eventStore) {
        committedEvent = this.eventStore.appendWithinTransaction({
          id: randomUUID(),
          schemaVersion: 1,
          actor: "system",
          timestamp: new Date().toISOString(),
          type: EventTypes.WORKFLOW_RESUMED,
          projectId: run.projectId,
          sessionId: run.sessionId,
          payload: { runId },
        });
      }
    });

    if (this.eventStore && committedEvent) {
      this.eventStore.notifyCommitted([committedEvent]);
    }

    return this.executor.execute(run, workflow);
  }

  /**
   * Cancel an active workflow run.
   */
  public async cancelWorkflow(runId: string, reason = "User cancellation"): Promise<WorkflowRun> {
    const run = this.workflowRepo.findWorkflowRunById(runId);
    if (!run) {
      throw new Error(`Workflow run "${runId}" not found.`);
    }

    const terminalStatuses = ["COMPLETED", "FAILED", "CANCELLED"];
    if (terminalStatuses.includes(run.status)) {
      return run;
    }

    run.status = "CANCELLED";
    run.completedAt = new Date().toISOString();
    run.errorMessage = reason;

    // Mark running tasks cancelled
    for (const nodeId of run.runningTasks) {
      if (run.nodeStates[nodeId]) {
        run.nodeStates[nodeId]!.status = "CANCELLED";
        run.nodeStates[nodeId]!.completedAt = new Date().toISOString();
      } else {
        run.nodeStates[nodeId] = {
          status: "CANCELLED",
          attempts: 1,
          completedAt: new Date().toISOString(),
        };
      }
    }
    run.runningTasks = [];

    let committedEvent: any = null;
    this.workflowRepo.sqliteEngine.transaction(() => {
      this.workflowRepo.saveWorkflowRun(run);
      if (this.eventStore) {
        committedEvent = this.eventStore.appendWithinTransaction({
          id: randomUUID(),
          schemaVersion: 1,
          actor: "system",
          timestamp: new Date().toISOString(),
          type: EventTypes.WORKFLOW_CANCELLED,
          projectId: run.projectId,
          sessionId: run.sessionId,
          payload: { runId, reason },
        });
      }
    });

    if (this.eventStore && committedEvent) {
      this.eventStore.notifyCommitted([committedEvent]);
    }

    return run;
  }


  /**
   * Authoritative external human approval resolution for a waiting gate.
   */
  public async approveGate(
    runId: string,
    nodeId: string,
    approval: ApprovalInput
  ): Promise<WorkflowRun> {
    const run = this.workflowRepo.findWorkflowRunById(runId);
    if (!run) {
      throw new Error(`Workflow run "${runId}" not found.`);
    }

    if (run.status !== "WAITING_APPROVAL") {
      throw new Error(`Workflow run "${runId}" is not waiting for approval (status: "${run.status}").`);
    }

    if (run.approvalGate?.nodeId !== nodeId) {
      throw new Error(`Approval gate mismatch: expected node "${run.approvalGate?.nodeId}", received "${nodeId}".`);
    }

    const workflow = this.workflowRepo.findWorkflowById(run.workflowId);
    if (!workflow) {
      throw new Error(`Workflow definition "${run.workflowId}" not found.`);
    }

    const now = new Date().toISOString();

    if (approval.decision === "REJECTED") {
      run.status = "FAILED";
      run.completedAt = now;
      run.errorMessage = `Approval gate rejected for node "${nodeId}": ${approval.notes || "No reason provided"}.`;
      run.approvalGate.decision = "REJECTED";
      run.approvalGate.approvedAt = now;
      run.approvalGate.approvedBy = approval.approverId || "human_reviewer";
      run.nodeStates[nodeId] = {
        status: "FAILED",
        attempts: 1,
        completedAt: now,
        error: run.errorMessage,
      };
      run.failedTasks.push(nodeId);
      this.workflowRepo.saveWorkflowRun(run);

      if (this.eventStore) {
        this.eventStore.append({
          id: randomUUID(),
          schemaVersion: 1,
          actor: "user",
          timestamp: now,
          type: EventTypes.WORKFLOW_FAILED,
          projectId: run.projectId,
          sessionId: run.sessionId,
          payload: { runId, nodeId, reason: run.errorMessage, approverId: approval.approverId },
        });
      }

      return run;
    }

    // Approved: mark node completed and resume DAG execution
    run.approvalGate.decision = "APPROVED";
    run.approvalGate.approvedAt = now;
    run.approvalGate.approvedBy = approval.approverId || "human_reviewer";
    run.nodeStates[nodeId] = {
      status: "COMPLETED",
      attempts: 1,
      completedAt: now,
      result: { approved: true, approver: run.approvalGate.approvedBy },
    };
    run.completedTasks.push(nodeId);
    run.status = "RUNNING";
    this.workflowRepo.saveWorkflowRun(run);

    return this.executor.execute(run, workflow);
  }

  /**
   * Get the current live state of a workflow run.
   */
  public getRunStatus(runId: string): WorkflowRun | null {
    return this.workflowRepo.findWorkflowRunById(runId);
  }
}
