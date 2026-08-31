import { randomUUID } from "node:crypto";
import {
  type WorkflowDefinition,
  type WorkflowRun,
  type WorkflowNode,
  type WorkflowTaskNode,
  type WorkflowParallelNode,
  type WorkflowForeachNode,
  type WorkflowVerifyNode,
  type WorkflowApproveNode,
} from "../domain/workflow.js";
import { EventTypes } from "../domain/event.js";
import { EventStore } from "../event-state/event-store.js";
import { WorkflowRepository } from "../persistence/repositories/workflow-repository.js";
import { DAGEngine } from "./dag-engine.js";
import { ConditionEvaluator } from "./condition-evaluator.js";
import { WorkflowBudgetTracker } from "./workflow-budget-tracker.js";
import { WorkflowRetryHandler } from "./workflow-retry-handler.js";

export type TaskDispatcherFn = (
  node: WorkflowTaskNode,
  run: WorkflowRun,
  context: { itemIndex?: number; itemValue?: unknown }
) => Promise<{
  status: "completed" | "failed";
  result?: unknown;
  error?: string;
  tokensUsed?: number;
  costUsd?: number;
}>;

export interface WorkflowExecutorOptions {
  workflowRepo: WorkflowRepository;
  eventStore?: EventStore;
  dagEngine?: DAGEngine;
  conditionEvaluator?: ConditionEvaluator;
  retryHandler?: WorkflowRetryHandler;
  taskDispatcher?: TaskDispatcherFn;
}

/**
 * Authoritative Workflow Execution Engine.
 * Coordinates topological DAG execution, parallel branches, foreach expansion,
 * condition evaluation, objective verification, restart-safe approvals, and budget tracking.
 * PRD Part 2 Section 109–135.
 */
export class WorkflowExecutor {
  private readonly workflowRepo: WorkflowRepository;
  private readonly eventStore?: EventStore;
  private readonly dagEngine: DAGEngine;
  private readonly conditionEvaluator: ConditionEvaluator;
  private readonly retryHandler: WorkflowRetryHandler;
  private readonly taskDispatcher: TaskDispatcherFn;

  constructor(options: WorkflowExecutorOptions) {
    this.workflowRepo = options.workflowRepo;
    this.eventStore = options.eventStore;
    this.dagEngine = options.dagEngine ?? new DAGEngine();
    this.conditionEvaluator = options.conditionEvaluator ?? new ConditionEvaluator();
    this.retryHandler = options.retryHandler ?? new WorkflowRetryHandler();
    this.taskDispatcher =
      options.taskDispatcher ??
      (async (node) => ({
        status: "completed",
        result: { executed: true, nodeId: node.id },
        tokensUsed: 100,
        costUsd: 0.001,
      }));
  }

  /**
   * Execute or resume a workflow run according to its DAG.
   */
  public async execute(
    run: WorkflowRun,
    workflow: WorkflowDefinition,
    options?: { abortSignal?: AbortSignal }
  ): Promise<WorkflowRun> {
    const dag = this.dagEngine.buildDAG(workflow);
    const budgetTracker = new WorkflowBudgetTracker(workflow.budget, workflow.concurrency);

    // If starting fresh from QUEUED or PAUSED
    if (run.status === "QUEUED" || run.status === "PAUSED") {
      run.status = "RUNNING";
      this.workflowRepo.saveWorkflowRun(run);
      this.emitEvent(EventTypes.WORKFLOW_STARTED, run, {
        workflowId: workflow.id,
        workflowVersion: workflow.version,
      });
    }

    const nodeMap = new Map<string, WorkflowNode>();
    for (const task of workflow.tasks) {
      nodeMap.set(task.id, task);
    }

    // Initialize node states if empty
    for (const nodeId of dag.nodeIds) {
      if (!run.nodeStates[nodeId]) {
        run.nodeStates[nodeId] = { status: "PENDING", attempts: 0 };
      }
    }

    // Iterate through topological wave levels
    for (let levelIndex = run.currentStepIndex; levelIndex < dag.levels.length; levelIndex++) {
      if (options?.abortSignal?.aborted || run.status === "CANCELLED") {
        run.status = "CANCELLED";
        this.workflowRepo.saveWorkflowRun(run);
        this.emitEvent(EventTypes.WORKFLOW_CANCELLED, run, { reason: "Abort signal triggered" });
        return run;
      }

      run.currentStepIndex = levelIndex;
      const currentLevelNodes = dag.levels[levelIndex] || [];
      const executionPromises: Promise<void>[] = [];

      for (const nodeId of currentLevelNodes) {
        const node = nodeMap.get(nodeId);
        if (!node) continue;

        const currentState = run.nodeStates[nodeId];
        if (currentState?.status === "COMPLETED" || currentState?.status === "SKIPPED") {
          continue;
        }

        // Check upstream prerequisites
        const upstream = dag.reverseAdjacency[nodeId] || [];
        const anyUpstreamFailed = upstream.some(
          (uId) => run.nodeStates[uId]?.status === "FAILED" || run.nodeStates[uId]?.status === "TIMED_OUT"
        );

        if (anyUpstreamFailed) {
          run.nodeStates[nodeId] = {
            status: "FAILED",
            attempts: 0,
            error: "Blocked due to failure in upstream prerequisite node.",
          };
          run.failedTasks.push(nodeId);
          continue;
        }

        const allUpstreamDone = upstream.every(
          (uId) =>
            run.nodeStates[uId]?.status === "COMPLETED" || run.nodeStates[uId]?.status === "SKIPPED"
        );

        if (!allUpstreamDone) {
          continue;
        }

        // Check condition before execution
        if ("condition" in node && node.condition) {
          const conditionContext = {
            taskResults: run.taskResults,
            completedTasks: run.completedTasks,
            failedTasks: run.failedTasks,
            variables: run.taskResults,
          };
          const condResult = this.conditionEvaluator.evaluate(node.condition, conditionContext);
          this.emitEvent(EventTypes.WORKFLOW_CONDITION_EVALUATED, run, {
            nodeId,
            condition: node.condition,
            outcome: condResult,
          });

          if (!condResult) {
            run.nodeStates[nodeId] = {
              status: "SKIPPED",
              attempts: 0,
              completedAt: new Date().toISOString(),
            };
            this.workflowRepo.saveWorkflowRun(run);
            continue;
          }
        }

        // Dispatch node based on kind
        executionPromises.push(
          this.executeNode(node, run, workflow, budgetTracker, options?.abortSignal)
        );
      }

      await Promise.all(executionPromises);
      this.workflowRepo.saveWorkflowRun(run);

      // If approval gate paused execution, exit gracefully
      if (run.status === "WAITING_APPROVAL") {
        return run;
      }

      // If any node in the wave failed, fail the workflow run
      const waveFailed = currentLevelNodes.some(
        (id) => run.nodeStates[id]?.status === "FAILED" || run.nodeStates[id]?.status === "TIMED_OUT"
      );

      if (waveFailed) {
        run.status = "FAILED";
        run.completedAt = new Date().toISOString();
        const failedNodeId = currentLevelNodes.find(
          (id) => run.nodeStates[id]?.status === "FAILED" || run.nodeStates[id]?.status === "TIMED_OUT"
        );
        const rootCause = failedNodeId ? run.nodeStates[failedNodeId]?.error : undefined;
        run.errorMessage = rootCause
          ? `Workflow execution halted at step ${levelIndex + 1}: ${rootCause}`
          : `Workflow execution halted due to failure in step ${levelIndex + 1}.`;
        this.workflowRepo.saveWorkflowRun(run);
        this.emitEvent(EventTypes.WORKFLOW_FAILED, run, {
          error: run.errorMessage,
          failedTasks: run.failedTasks,
        });
        return run;
      }
    }

    // All waves completed successfully
    run.status = "COMPLETED";
    run.completedAt = new Date().toISOString();
    this.workflowRepo.saveWorkflowRun(run);
    this.emitEvent(EventTypes.WORKFLOW_COMPLETED, run, {
      completedTasks: run.completedTasks,
      budgetConsumption: run.budgetConsumption,
    });

    return run;
  }

  private async executeNode(
    node: WorkflowNode,
    run: WorkflowRun,
    _workflow: WorkflowDefinition,
    budgetTracker: WorkflowBudgetTracker,
    _abortSignal?: AbortSignal
  ): Promise<void> {
    const nodeState = run.nodeStates[node.id] || { status: "PENDING", attempts: 0 };
    nodeState.status = "RUNNING";
    nodeState.startedAt = new Date().toISOString();
    run.runningTasks.push(node.id);
    this.workflowRepo.saveWorkflowRun(run);

    this.emitEvent(EventTypes.WORKFLOW_TASK_STARTED, run, {
      nodeId: node.id,
      kind: node.kind,
    });

    try {
      switch (node.kind) {
        case "task": {
          await this.executeTaskWithRetries(node, run, budgetTracker);
          break;
        }

        case "parallel": {
          await this.executeParallelNode(node, run, budgetTracker);
          break;
        }

        case "foreach": {
          await this.executeForeachNode(node, run, budgetTracker);
          break;
        }

        case "verify": {
          await this.executeVerifyNode(node, run);
          break;
        }

        case "approve": {
          this.executeApproveNode(node, run);
          return; // Pause execution
        }
      }

      nodeState.status = "COMPLETED";
      nodeState.completedAt = new Date().toISOString();
      run.completedTasks.push(node.id);
      run.runningTasks = run.runningTasks.filter((id) => id !== node.id);

      this.emitEvent(EventTypes.WORKFLOW_TASK_COMPLETED, run, {
        nodeId: node.id,
        kind: node.kind,
      });
    } catch (err: any) {
      nodeState.status = err.name === "TimeoutError" ? "TIMED_OUT" : "FAILED";
      nodeState.completedAt = new Date().toISOString();
      nodeState.error = err.message || String(err);
      run.failedTasks.push(node.id);
      run.runningTasks = run.runningTasks.filter((id) => id !== node.id);

      this.emitEvent(EventTypes.WORKFLOW_TASK_FAILED, run, {
        nodeId: node.id,
        kind: node.kind,
        error: nodeState.error,
      });
    }
  }

  private async executeTaskWithRetries(
    node: WorkflowTaskNode,
    run: WorkflowRun,
    budgetTracker: WorkflowBudgetTracker
  ): Promise<void> {
    const maxRetries = node.maxRetries ?? 3;
    let attempt = 0;

    while (attempt <= maxRetries) {
      attempt++;
      run.nodeStates[node.id]!.attempts = attempt;

      // Check budget before task execution
      const budgetCheck = budgetTracker.checkTokenBudget(run.budgetConsumption, node.budgetTokens || 100);
      if (!budgetCheck.allowed) {
        throw new Error(budgetCheck.reason);
      }

      try {
        const timeoutMs = node.timeoutMs ?? 30000;
        const res = await this.withTimeout(
          this.taskDispatcher(node, run, {}),
          timeoutMs,
          `Task "${node.id}" timed out after ${timeoutMs}ms.`
        );

        if (res.status === "completed") {
          run.taskResults[node.id] = res.result;
          run.nodeStates[node.id]!.result = res.result;
          run.budgetConsumption = budgetTracker.recordConsumption(run.budgetConsumption, {
            tokens: res.tokensUsed || 100,
            costUsd: res.costUsd || 0,
            toolCalls: 1,
          });
          return;
        }

        throw new Error(res.error || `Task "${node.id}" execution failed.`);
      } catch (err: any) {
        const retryDecision = this.retryHandler.evaluateRetry(err, attempt, maxRetries);
        if (!retryDecision.shouldRetry) {
          throw err;
        }
        if (retryDecision.backoffMs > 0) {
          await new Promise((r) => setTimeout(r, retryDecision.backoffMs));
        }
      }
    }
  }

  private async executeParallelNode(
    node: WorkflowParallelNode,
    run: WorkflowRun,
    budgetTracker: WorkflowBudgetTracker
  ): Promise<void> {
    const maxConcurrency = node.maxConcurrency || 4;
    const subTasks = node.tasks;
    const results: Record<string, unknown> = {};

    // Execute sub-tasks with bounded parallel pool
    for (let i = 0; i < subTasks.length; i += maxConcurrency) {
      const batch = subTasks.slice(i, i + maxConcurrency);
      const batchPromises = batch.map(async (st) => {
        const res = await this.taskDispatcher(st, run, {});
        if (res.status !== "completed") {
          throw new Error(res.error || `Sub-task "${st.id}" failed in parallel node "${node.id}".`);
        }
        results[st.id] = res.result;
        run.budgetConsumption = budgetTracker.recordConsumption(run.budgetConsumption, {
          tokens: res.tokensUsed || 100,
          costUsd: res.costUsd || 0,
          toolCalls: 1,
        });
      });
      await Promise.all(batchPromises);
    }

    run.taskResults[node.id] = results;
    run.nodeStates[node.id]!.result = results;
  }

  private async executeForeachNode(
    node: WorkflowForeachNode,
    run: WorkflowRun,
    budgetTracker: WorkflowBudgetTracker
  ): Promise<void> {
    const rawCollection = run.taskResults[node.collection] || run.taskResults;
    let items: unknown[] = [];

    if (Array.isArray(rawCollection)) {
      items = rawCollection;
    } else if (rawCollection && typeof rawCollection === "object") {
      items = Object.values(rawCollection);
    }

    // Enforce hard item limit to prevent denial of service (PRD Part 2 Section 110)
    const maxItems = 50;
    if (items.length > maxItems) {
      throw new Error(
        `Foreach node "${node.id}" collection "${node.collection}" contains ${items.length} items, exceeding maximum allowed limit of ${maxItems}.`
      );
    }

    const foreachState = {
      totalItems: items.length,
      completedItems: 0,
      failedItems: 0,
      itemResults: {} as Record<string, unknown>,
    };
    run.foreachStates[node.id] = foreachState;

    const maxConcurrency = node.maxConcurrency || 4;

    for (let i = 0; i < items.length; i += maxConcurrency) {
      const batch = items.slice(i, i + maxConcurrency);
      const batchPromises = batch.map(async (item, batchIdx) => {
        const itemIdx = i + batchIdx;
        const itemKey = `item_${itemIdx}`;
        const res = await this.taskDispatcher(node.task, run, {
          itemIndex: itemIdx,
          itemValue: item,
        });

        if (res.status === "completed") {
          foreachState.completedItems++;
          foreachState.itemResults[itemKey] = res.result;
          run.budgetConsumption = budgetTracker.recordConsumption(run.budgetConsumption, {
            tokens: res.tokensUsed || 50,
            costUsd: res.costUsd || 0,
            toolCalls: 1,
          });
        } else {
          foreachState.failedItems++;
          throw new Error(`Foreach item ${itemIdx} failed: ${res.error}`);
        }
      });
      await Promise.all(batchPromises);
    }

    run.taskResults[node.id] = foreachState.itemResults;
    run.nodeStates[node.id]!.result = foreachState.itemResults;
  }

  private async executeVerifyNode(node: WorkflowVerifyNode, run: WorkflowRun): Promise<void> {
    const failedAssertions: string[] = [];

    for (const assertion of node.assertions) {
      const evalContext = {
        taskResults: run.taskResults,
        completedTasks: run.completedTasks,
        failedTasks: run.failedTasks,
        variables: run.taskResults,
      };

      const pass = this.conditionEvaluator.evaluateExpression(assertion, evalContext);
      if (!pass) {
        failedAssertions.push(assertion);
      }
    }

    if (failedAssertions.length > 0) {
      throw new Error(
        `Verification node "${node.id}" failed assertions: [${failedAssertions.join("; ")}].`
      );
    }

    run.taskResults[node.id] = { verified: true, assertions: node.assertions };
    run.nodeStates[node.id]!.result = { verified: true };
  }

  private executeApproveNode(node: WorkflowApproveNode, run: WorkflowRun): void {
    run.status = "WAITING_APPROVAL";
    run.nodeStates[node.id] = {
      status: "WAITING_APPROVAL",
      attempts: 1,
      startedAt: new Date().toISOString(),
    };
    run.approvalGate = {
      nodeId: node.id,
      message: node.message,
      requiredRole: node.requiredRole,
      requestedAt: new Date().toISOString(),
    };
    this.workflowRepo.saveWorkflowRun(run);
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number, timeoutMsg: string): Promise<T> {
    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        const err = new Error(timeoutMsg);
        err.name = "TimeoutError";
        reject(err);
      }, ms);
    });

    try {
      const res = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timeoutId!);
      return res;
    } finally {
      clearTimeout(timeoutId!);
    }
  }

  private emitEvent(type: string, run: WorkflowRun, payload: Record<string, unknown>): void {
    if (!this.eventStore) return;
    this.eventStore.append({
      id: randomUUID(),
      schemaVersion: 1,
      actor: "system",
      timestamp: new Date().toISOString(),
      type,
      projectId: run.projectId,
      sessionId: run.sessionId,
      payload: {
        runId: run.id,
        workflowId: run.workflowId,
        ...payload,
      },
    });
  }
}
