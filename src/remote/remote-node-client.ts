import {
  type RemoteWorkRequest,
  type RemoteResult,
  RemoteWorkRequestSchema,
  RemoteResultSchema,
} from "../domain/node.js";
import { RemoteAuthVerifier } from "./remote-auth-verifier.js";

export type RemoteWorkerFn = (
  request: RemoteWorkRequest,
  abortSignal: AbortSignal
) => Promise<{
  artifacts?: string[];
  data?: unknown;
  tokensUsed?: number;
  costUsd?: number;
  durationMs?: number;
  toolCalls?: number;
}>;

export interface RemoteNodeClientOptions {
  nodeId: string;
  authVerifier?: RemoteAuthVerifier;
  heartbeatSender?: (req: {
    dispatchId: string;
    nodeId: string;
    leaseId: string;
    generation: number;
    agentId: string;
    instanceId: string;
  }) => Promise<{ success: boolean; reason?: string }>;
  heartbeatIntervalMs?: number;
}

/**
 * Remote Node Worker Client.
 * Runs on the remote worker node, executes assigned work, sends heartbeats,
 * and produces signed RemoteResult payloads.
 * PRD Part 2 Section 140–165.
 */
export class RemoteNodeClient {
  public readonly nodeId: string;
  private readonly authVerifier: RemoteAuthVerifier;
  private readonly heartbeatSender?: (req: {
    dispatchId: string;
    nodeId: string;
    leaseId: string;
    generation: number;
    agentId: string;
    instanceId: string;
  }) => Promise<{ success: boolean; reason?: string }>;
  private readonly heartbeatIntervalMs: number;

  constructor(options: RemoteNodeClientOptions) {
    this.nodeId = options.nodeId;
    this.authVerifier = options.authVerifier ?? new RemoteAuthVerifier();
    this.heartbeatSender = options.heartbeatSender;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 5000;
  }

  /**
   * Execute a received RemoteWorkRequest.
   */
  public async executeTask(
    request: RemoteWorkRequest,
    workerFn: RemoteWorkerFn
  ): Promise<RemoteResult> {
    const validatedReq = RemoteWorkRequestSchema.parse(request);

    if (validatedReq.nodeId !== this.nodeId) {
      throw new Error(
        `Node ID mismatch: WorkRequest targeted to "${validatedReq.nodeId}", but client is "${this.nodeId}".`
      );
    }

    const abortController = new AbortController();
    let intervalId: NodeJS.Timeout | undefined;

    if (this.heartbeatSender) {
      intervalId = setInterval(async () => {
        try {
          const hbRes = await this.heartbeatSender!({
            dispatchId: validatedReq.dispatchId,
            nodeId: this.nodeId,
            leaseId: validatedReq.leaseId,
            generation: validatedReq.generation,
            agentId: validatedReq.agentId,
            instanceId: validatedReq.instanceId,
          });

          if (!hbRes.success) {
            abortController.abort();
            clearInterval(intervalId);
          }
        } catch {
          abortController.abort();
          clearInterval(intervalId);
        }
      }, this.heartbeatIntervalMs);
    }

    try {
      const output = await workerFn(validatedReq, abortController.signal);
      if (intervalId) clearInterval(intervalId);

      const resultPayload = {
        dispatchId: validatedReq.dispatchId,
        nodeId: this.nodeId,
        taskId: validatedReq.taskId,
        jobId: validatedReq.jobId,
        generation: validatedReq.generation,
        leaseId: validatedReq.leaseId,
        status: "SUCCESS" as const,
        artifacts: output.artifacts || [],
        data: output.data,
        consumption: {
          tokens: output.tokensUsed || 0,
          costUsd: output.costUsd || 0,
          durationMs: output.durationMs || 0,
          toolCalls: output.toolCalls || 0,
        },
        completedAt: new Date().toISOString(),
      };

      const signature = this.authVerifier.signPayload({
        dispatchId: resultPayload.dispatchId,
        nodeId: resultPayload.nodeId,
        taskId: resultPayload.taskId,
        jobId: resultPayload.jobId,
        generation: resultPayload.generation,
        leaseId: resultPayload.leaseId,
        status: resultPayload.status,
      });

      return RemoteResultSchema.parse({
        ...resultPayload,
        signature,
      });
    } catch (err: any) {
      if (intervalId) clearInterval(intervalId);

      const resultPayload = {
        dispatchId: validatedReq.dispatchId,
        nodeId: this.nodeId,
        taskId: validatedReq.taskId,
        jobId: validatedReq.jobId,
        generation: validatedReq.generation,
        leaseId: validatedReq.leaseId,
        status: "FAILURE" as const,
        artifacts: [],
        consumption: { tokens: 0, costUsd: 0, durationMs: 0, toolCalls: 0 },
        error: err.message || String(err),
        completedAt: new Date().toISOString(),
      };

      const signature = this.authVerifier.signPayload({
        dispatchId: resultPayload.dispatchId,
        nodeId: resultPayload.nodeId,
        taskId: resultPayload.taskId,
        jobId: resultPayload.jobId,
        generation: resultPayload.generation,
        leaseId: resultPayload.leaseId,
        status: resultPayload.status,
      });

      return RemoteResultSchema.parse({
        ...resultPayload,
        signature,
      });
    } finally {
      if (intervalId) clearInterval(intervalId);
    }
  }
}
