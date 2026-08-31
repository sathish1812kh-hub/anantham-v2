import { randomUUID } from "node:crypto";
import { type WorkflowRun } from "../domain/workflow.js";
import { EventTypes } from "../domain/event.js";
import { EventStore } from "../event-state/event-store.js";
import { WorkflowRepository } from "../persistence/repositories/workflow-repository.js";

export interface ReconciledRunSummary {
  runId: string;
  previousStatus: string;
  newStatus: string;
  recoveredTasks: string[];
  reconciledAt: string;
}

/**
 * Workflow Recovery & State Reconciler.
 * Recovers active workflow runs following system crash, restart, or worker loss.
 * PRD Part 1 Section 50–54 & PRD Part 2 Section 113.
 */
export class WorkflowRecoveryReconciler {
  constructor(
    private readonly workflowRepo: WorkflowRepository,
    private readonly eventStore?: EventStore
  ) {}

  /**
   * Scan and reconcile all uncompleted workflow runs.
   */
  public async reconcileActiveRuns(projectId?: string): Promise<ReconciledRunSummary[]> {
    const activeRuns = this.workflowRepo.listActiveWorkflowRuns(projectId);
    const summaries: ReconciledRunSummary[] = [];

    for (const run of activeRuns) {
      const summary = this.reconcileSingleRun(run);
      summaries.push(summary);
    }

    return summaries;
  }

  /**
   * Reconcile a single workflow run instance.
   */
  public reconcileSingleRun(run: WorkflowRun): ReconciledRunSummary {
    const previousStatus = run.status;
    const recoveredTasks: string[] = [];
    const now = new Date().toISOString();

    // 1. If run was waiting for approval, keep it waiting for approval (restart-safe!)
    if (run.status === "WAITING_APPROVAL") {
      return {
        runId: run.id,
        previousStatus,
        newStatus: "WAITING_APPROVAL",
        recoveredTasks: [],
        reconciledAt: now,
      };
    }

    // 2. If run was actively RUNNING, recover running tasks
    if (run.status === "RUNNING") {
      for (const nodeId of run.runningTasks) {
        if (run.nodeStates[nodeId]) {
          // Mark interrupted running task as failed so it can be retried or inspected
          run.nodeStates[nodeId]!.status = "FAILED";
          run.nodeStates[nodeId]!.error = "Interrupted by process crash or worker loss.";
          run.nodeStates[nodeId]!.completedAt = now;
          run.failedTasks.push(nodeId);
          recoveredTasks.push(nodeId);
        }
      }
      run.runningTasks = [];
      run.status = "PAUSED"; // Pause so operator or resume engine can trigger safe retry

      this.workflowRepo.saveWorkflowRun(run);

      if (this.eventStore) {
        this.eventStore.append({
          id: randomUUID(),
          schemaVersion: 1,
          actor: "system",
          timestamp: now,
          type: EventTypes.WORKFLOW_PAUSED,
          projectId: run.projectId,
          sessionId: run.sessionId,
          payload: {
            runId: run.id,
            reason: "Crash recovery: reconciled interrupted running tasks and paused run for safe resumption.",
            recoveredTasks,
          },
        });
      }
    }

    return {
      runId: run.id,
      previousStatus,
      newStatus: run.status,
      recoveredTasks,
      reconciledAt: now,
    };
  }
}
