import { randomUUID } from "node:crypto";
import { type RemoteWorkRequest, type RemoteDispatchStatus } from "../domain/node.js";
import { EventTypes } from "../domain/event.js";
import { EventStore } from "../event-state/event-store.js";
import { RemoteDispatchRepository } from "../persistence/repositories/remote-dispatch-repository.js";
import { NodeRepository } from "../persistence/repositories/node-repository.js";
import { TaskClaimManager } from "../tasks/task-claim-manager.js";

export interface ReconciledDispatchSummary {
  dispatchId: string;
  nodeId: string;
  previousStatus: RemoteDispatchStatus;
  newStatus: RemoteDispatchStatus;
  reclaimedLeaseId: string;
  reconciledAt: string;
}

/**
 * Remote Multi-Node Recovery & Partition Reconciler.
 * PRD Part 1 Section 50–54 & PRD Part 2 Section 140–165.
 */
export class RemoteRecoveryReconciler {
  constructor(
    private readonly dispatchRepo: RemoteDispatchRepository,
    private readonly nodeRepo: NodeRepository,
    private readonly claimManager: TaskClaimManager,
    private readonly eventStore?: EventStore
  ) {}

  /**
   * Scan and reconcile active remote dispatches.
   */
  public reconcileActiveDispatches(): ReconciledDispatchSummary[] {
    const activeDispatches = this.dispatchRepo.listActiveDispatches();
    const summaries: ReconciledDispatchSummary[] = [];

    for (const dispatch of activeDispatches) {
      const summary = this.reconcileSingleDispatch(dispatch);
      summaries.push(summary);
    }

    return summaries;
  }

  /**
   * Reconcile a single remote dispatch.
   */
  public reconcileSingleDispatch(dispatch: RemoteWorkRequest): ReconciledDispatchSummary {
    const previousStatus = dispatch.status;
    const now = new Date().toISOString();
    const node = this.nodeRepo.findNodeById(dispatch.nodeId);

    // Release task lease on controller
    this.claimManager.releaseTask(
      dispatch.taskId,
      dispatch.leaseId,
      dispatch.generation,
      "REMOTE_DISPATCH_RECONCILED"
    );

    const newStatus: RemoteDispatchStatus = "RECLAIMED";
    dispatch.status = newStatus;
    this.dispatchRepo.saveDispatch(dispatch);

    if (this.eventStore) {
      this.eventStore.append({
        id: randomUUID(),
        schemaVersion: 1,
        actor: "system",
        timestamp: now,
        type: EventTypes.DISPATCH_RECLAIMED,
        projectId: dispatch.projectId,
        sessionId: dispatch.sessionId,
        payload: {
          dispatchId: dispatch.dispatchId,
          taskId: dispatch.taskId,
          nodeId: dispatch.nodeId,
          previousStatus,
          newStatus,
          nodeStatus: node?.status || "UNKNOWN",
          reason: "Controller restart or node partition detected.",
        },
      });
    }

    return {
      dispatchId: dispatch.dispatchId,
      nodeId: dispatch.nodeId,
      previousStatus,
      newStatus,
      reclaimedLeaseId: dispatch.leaseId,
      reconciledAt: now,
    };
  }
}
