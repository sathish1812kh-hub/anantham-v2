import { randomUUID } from "node:crypto";
import {
  type RemoteWorkRequest,
  type RemoteResult,
  RemoteWorkRequestSchema,
  RemoteResultSchema,
} from "../domain/node.js";
import { type WorkflowBudget } from "../domain/workflow.js";
import { EventTypes } from "../domain/event.js";
import { EventStore } from "../event-state/event-store.js";
import { RemoteDispatchRepository } from "../persistence/repositories/remote-dispatch-repository.js";
import { TaskRepository } from "../persistence/repositories/task-repository.js";
import { NodeRegistry } from "./node-registry.js";
import { RemoteAuthVerifier } from "./remote-auth-verifier.js";
import { TaskClaimManager } from "../tasks/task-claim-manager.js";

export interface RemoteDispatchManagerOptions {
  dispatchRepo: RemoteDispatchRepository;
  taskRepo: TaskRepository;
  nodeRegistry: NodeRegistry;
  claimManager: TaskClaimManager;
  eventStore?: EventStore;
  authVerifier?: RemoteAuthVerifier;
}

export interface DispatchTaskOptions {
  dispatchId?: string;
  jobId?: string;
  taskId: string;
  workflowId?: string;
  runId?: string;
  agentId: string;
  instanceId?: string;
  projectId: string;
  sessionId: string;
  planId?: string;
  requiredCapabilities?: string[];
  executorProfile?: string;
  budget?: WorkflowBudget;
  deadline?: string;
  payload?: unknown;
  idempotencyKey?: string;
  targetNodeId?: string;
}

/**
 * Authoritative Central Controller Remote Dispatch Manager.
 * PRD Part 2 Section 140–165.
 */
export class RemoteDispatchManager {
  private readonly dispatchRepo: RemoteDispatchRepository;
  private readonly taskRepo: TaskRepository;
  private readonly nodeRegistry: NodeRegistry;
  private readonly claimManager: TaskClaimManager;
  private readonly eventStore?: EventStore;
  private readonly authVerifier: RemoteAuthVerifier;

  constructor(options: RemoteDispatchManagerOptions) {
    this.dispatchRepo = options.dispatchRepo;
    this.taskRepo = options.taskRepo;
    this.nodeRegistry = options.nodeRegistry;
    this.claimManager = options.claimManager;
    this.eventStore = options.eventStore;
    this.authVerifier = options.authVerifier ?? new RemoteAuthVerifier();
  }

  /**
   * Dispatch a task to an eligible remote worker node.
   * Performs idempotency check and acquires exclusive lease with monotonic generation token.
   */
  public dispatchTask(options: DispatchTaskOptions): RemoteWorkRequest {
    const idempotencyKey = options.idempotencyKey || `idem_${randomUUID()}`;

    // 1. Idempotency Check
    const existing = this.dispatchRepo.findDispatchByIdempotencyKey(idempotencyKey);
    if (existing) {
      return existing;
    }

    // 2. Select Eligible Worker Node
    let node = options.targetNodeId ? this.nodeRegistry.getNode(options.targetNodeId) : null;
    if (!node) {
      node = this.nodeRegistry.findEligibleNode(
        options.requiredCapabilities,
        options.projectId,
        options.executorProfile
      );
    }

    if (!node) {
      throw new Error(
        `No eligible remote node available for capabilities [${(options.requiredCapabilities || []).join(", ")}] in project "${options.projectId}".`
      );
    }

    const instanceId = options.instanceId || `inst_${randomUUID()}`;
    const dispatchId = options.dispatchId || `disp_${randomUUID()}`;
    const now = new Date().toISOString();

    // 3. Acquire Authoritative Lease & Monotonic Generation Token
    const claimRes = this.claimManager.claimTask({
      taskId: options.taskId,
      agentId: options.agentId,
      instanceId,
      projectId: options.projectId,
      sessionId: options.sessionId,
    });

    if (!claimRes.success || !claimRes.lease) {
      throw new Error(
        `Failed to claim task "${options.taskId}" for remote dispatch: ${claimRes.errorMessage || "Lease acquisition rejected."}`
      );
    }

    // 4. Create RemoteWorkRequest Contract
    const dispatch: RemoteWorkRequest = RemoteWorkRequestSchema.parse({
      dispatchId,
      jobId: options.jobId || options.taskId,
      taskId: options.taskId,
      workflowId: options.workflowId,
      runId: options.runId,
      agentId: options.agentId,
      instanceId,
      nodeId: node.id,
      projectId: options.projectId,
      sessionId: options.sessionId,
      planId: options.planId,
      generation: claimRes.lease.generation, // Monotonic generation token
      leaseId: claimRes.lease.id,
      requiredCapabilities: options.requiredCapabilities || [],
      budget: options.budget,
      deadline: options.deadline,
      payload: options.payload,
      idempotencyKey,
      createdAt: now,
      status: "DISPATCHED",
      metadata: {},
    });

    this.dispatchRepo.saveDispatch(dispatch);

    this.emitEvent(EventTypes.DISPATCH_CREATED, dispatch, { nodeId: node.id });
    this.emitEvent(EventTypes.DISPATCH_SENT, dispatch, {
      nodeId: node.id,
      generation: dispatch.generation,
      leaseId: dispatch.leaseId,
    });

    return dispatch;
  }

  /**
   * Handle authenticated remote heartbeat. Fencing tokens are strictly validated.
   */
  public handleRemoteHeartbeat(req: {
    dispatchId: string;
    nodeId: string;
    leaseId: string;
    generation: number;
    agentId: string;
    instanceId: string;
  }): { success: boolean; reason?: string } {
    const dispatch = this.dispatchRepo.findDispatchById(req.dispatchId);
    if (!dispatch) {
      return { success: false, reason: `Dispatch "${req.dispatchId}" not found.` };
    }

    if (dispatch.nodeId !== req.nodeId) {
      return { success: false, reason: `Node mismatch: expected "${dispatch.nodeId}", got "${req.nodeId}".` };
    }

    // Monotonic Generation Fencing Check
    if (dispatch.generation !== req.generation || dispatch.leaseId !== req.leaseId) {
      this.emitEvent(EventTypes.REMOTE_SPLIT_BRAIN_DETECTED, dispatch, {
        providedGeneration: req.generation,
        expectedGeneration: dispatch.generation,
        reason: "Stale heartbeat received from partitioned or superseded node.",
      });
      return {
        success: false,
        reason: `FENCING_VIOLATION: Provided lease (${req.leaseId}, gen: ${req.generation}) does not match active dispatch lease (${dispatch.leaseId}, gen: ${dispatch.generation}).`,
      };
    }

    // Renew lease via TaskClaimManager
    const hbRes = this.claimManager.heartbeat({
      leaseId: req.leaseId,
      agentId: req.agentId,
      instanceId: req.instanceId,
      generation: req.generation,
    });

    if (!hbRes.success) {
      return { success: false, reason: hbRes.errorMessage };
    }

    // Refresh node heartbeat
    this.nodeRegistry.heartbeat({ nodeId: req.nodeId });

    return { success: true };
  }

  /**
   * 7-Step Verification and acceptance pipeline for untrusted remote results.
   * PRD Part 2 Section 154.
   */
  public acceptRemoteResult(result: RemoteResult): { success: boolean; reason?: string } {
    // Step 1: Schema validation
    const parsed = RemoteResultSchema.safeParse(result);
    if (!parsed.success) {
      return { success: false, reason: `INVALID_SCHEMA: ${parsed.error.message}` };
    }
    const res = parsed.data;

    // Step 2: Signature verification if signature is provided
    if (res.signature) {
      const payloadToVerify = {
        dispatchId: res.dispatchId,
        nodeId: res.nodeId,
        taskId: res.taskId,
        jobId: res.jobId,
        generation: res.generation,
        leaseId: res.leaseId,
        status: res.status,
      };
      if (!this.authVerifier.verifySignature(payloadToVerify, res.signature)) {
        this.emitEvent(EventTypes.REMOTE_RESULT_REJECTED, { dispatchId: res.dispatchId } as any, {
          reason: "Cryptographic signature verification failed.",
        });
        return { success: false, reason: "AUTHENTICATION_FAILED: Invalid signature." };
      }
    }

    // Step 3: Dispatch lookup
    const dispatch = this.dispatchRepo.findDispatchById(res.dispatchId);
    if (!dispatch) {
      return { success: false, reason: `Dispatch "${res.dispatchId}" not found.` };
    }

    if (dispatch.status === "COMPLETED") {
      // Idempotent acceptance
      return { success: true };
    }

    // Step 4: Monotonic Generation Fencing Check (Split-brain prevention)
    if (dispatch.generation !== res.generation || dispatch.leaseId !== res.leaseId) {
      this.emitEvent(EventTypes.REMOTE_SPLIT_BRAIN_DETECTED, dispatch, {
        providedGeneration: res.generation,
        expectedGeneration: dispatch.generation,
        reason: "Stale completion attempt from partitioned or superseded node.",
      });
      return {
        success: false,
        reason: `FENCING_VIOLATION: Result carries stale generation "${res.generation}". Current active generation is "${dispatch.generation}".`,
      };
    }

    // Step 5: Task status check
    const task = this.taskRepo.findById(dispatch.taskId);
    if (!task) {
      return { success: false, reason: `Underlying task "${dispatch.taskId}" not found.` };
    }

    if (task.status === "cancelled") {
      return { success: false, reason: `Task "${dispatch.taskId}" has already been cancelled.` };
    }

    // Step 6 & 7: Commit completion or failure to SQLite WAL
    if (res.status === "SUCCESS") {
      const compSuccess = this.claimManager.completeTask(
        dispatch.taskId,
        dispatch.leaseId,
        dispatch.generation,
        { artifacts: res.artifacts, data: res.data }
      );

      if (!compSuccess) {
        return { success: false, reason: "Failed to complete task in claim manager." };
      }

      dispatch.status = "COMPLETED";
      this.dispatchRepo.saveDispatch(dispatch);

      this.emitEvent(EventTypes.DISPATCH_COMPLETED, dispatch, {
        artifacts: res.artifacts,
        consumption: res.consumption,
      });
      this.emitEvent(EventTypes.REMOTE_RESULT_RECEIVED, dispatch, { status: "SUCCESS" });

      return { success: true };
    } else {
      this.claimManager.failTask(
        dispatch.taskId,
        dispatch.leaseId,
        dispatch.generation,
        res.error || "Remote execution failed."
      );

      dispatch.status = "FAILED";
      this.dispatchRepo.saveDispatch(dispatch);

      this.emitEvent(EventTypes.DISPATCH_FAILED, dispatch, { error: res.error });
      return { success: true };
    }
  }

  /**
   * Cancel an active remote dispatch.
   */
  public cancelDispatch(dispatchId: string, reason = "User cancellation"): void {
    const dispatch = this.dispatchRepo.findDispatchById(dispatchId);
    if (!dispatch) return;

    if (dispatch.status === "COMPLETED" || dispatch.status === "CANCELLED") {
      return;
    }

    dispatch.status = "CANCELLED";
    this.dispatchRepo.saveDispatch(dispatch);

    this.claimManager.releaseTask(dispatch.taskId, dispatch.leaseId, dispatch.generation, reason);
    this.emitEvent(EventTypes.DISPATCH_FAILED, dispatch, { reason: `Cancelled: ${reason}` });
  }

  public getDispatch(dispatchId: string): RemoteWorkRequest | null {
    return this.dispatchRepo.findDispatchById(dispatchId);
  }

  private emitEvent(type: string, dispatch: RemoteWorkRequest, payload: Record<string, unknown>): void {
    if (!this.eventStore) return;
    this.eventStore.append({
      id: randomUUID(),
      schemaVersion: 1,
      actor: "system",
      timestamp: new Date().toISOString(),
      type,
      projectId: dispatch.projectId,
      sessionId: dispatch.sessionId,
      payload: {
        dispatchId: dispatch.dispatchId,
        taskId: dispatch.taskId,
        jobId: dispatch.jobId,
        agentId: dispatch.agentId,
        nodeId: dispatch.nodeId,
        generation: dispatch.generation,
        leaseId: dispatch.leaseId,
        ...payload,
      },
    });
  }
}
