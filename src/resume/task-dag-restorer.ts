import type { Task } from "../domain/task.js";
import type { TaskRepository } from "../persistence/repositories/task-repository.js";
import type { RestoredTaskDAG } from "./resume-contract.js";

export class TaskDagRestorer {
  /**
   * Reconstructs the task dependency graph and execution order for a session.
   * PRD Part 1 Section 56 & 57.
   */
  public static restoreDAG(
    tasks: Readonly<Task>[],
    options?: {
      taskRepo?: TaskRepository;
      reconcileInterruptedTasks?: boolean;
    }
  ): RestoredTaskDAG {
    const taskMap = new Map<string, Task>();
    const shouldReconcile = options?.reconcileInterruptedTasks ?? true;

    // 1. Process tasks and reconcile interrupted tasks if needed
    for (const rawTask of tasks) {
      let task = { ...rawTask };

      if (shouldReconcile) {
        // If task was left in running or claimed state during a crash, reset to queued
        if (task.status === "running" || task.status === "claimed" || task.status === "verifying") {
          task.status = "queued";
          if (options?.taskRepo) {
            try {
              options.taskRepo.updateStatus(task.id, "blocked");
              options.taskRepo.updateStatus(task.id, "queued");
            } catch {
              // Best effort repository update
            }
          }
        }
      }

      taskMap.set(task.id, task);
    }

    const queuedTasks: Task[] = [];
    const runningTasks: Task[] = [];
    const blockedTasks: Task[] = [];
    const completedTasks: Task[] = [];
    const failedTasks: Task[] = [];
    const cancelledTasks: Task[] = [];
    const unresolvedDependencies: Record<string, string[]> = {};

    // 2. Classify task states and resolve dependencies
    for (const task of taskMap.values()) {
      const missingDeps: string[] = [];

      for (const depId of task.dependencies || []) {
        const depTask = taskMap.get(depId);
        if (!depTask || depTask.status !== "completed") {
          missingDeps.push(depId);
        }
      }

      if (missingDeps.length > 0) {
        unresolvedDependencies[task.id] = missingDeps;
        if (task.status !== "completed" && task.status !== "failed" && task.status !== "cancelled") {
          task.status = "blocked";
        }
      }

      switch (task.status) {
        case "queued":
          queuedTasks.push(task);
          break;
        case "running":
        case "claimed":
        case "verifying":
          runningTasks.push(task);
          break;
        case "blocked":
          blockedTasks.push(task);
          break;
        case "completed":
          completedTasks.push(task);
          break;
        case "failed":
          failedTasks.push(task);
          break;
        case "cancelled":
          cancelledTasks.push(task);
          break;
      }
    }

    // 3. Topologically sort tasks for deterministic execution order (Kahn algorithm)
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const taskId of taskMap.keys()) {
      inDegree.set(taskId, 0);
      adj.set(taskId, []);
    }

    for (const task of taskMap.values()) {
      for (const depId of task.dependencies || []) {
        if (taskMap.has(depId)) {
          adj.get(depId)!.push(task.id);
          inDegree.set(task.id, (inDegree.get(task.id) || 0) + 1);
        }
      }
    }

    const queue: string[] = [];
    for (const [taskId, deg] of inDegree.entries()) {
      if (deg === 0) {
        queue.push(taskId);
      }
    }

    const executionOrder: string[] = [];
    while (queue.length > 0) {
      queue.sort(); // Deterministic tie-breaking
      const u = queue.shift()!;
      executionOrder.push(u);

      for (const v of adj.get(u) || []) {
        const newDeg = (inDegree.get(v) || 0) - 1;
        inDegree.set(v, newDeg);
        if (newDeg === 0) {
          queue.push(v);
        }
      }
    }

    // Append any un-ordered tasks (e.g. if cycle occurred) deterministically
    for (const taskId of taskMap.keys()) {
      if (!executionOrder.includes(taskId)) {
        executionOrder.push(taskId);
      }
    }

    const activeTask = runningTasks[0] || queuedTasks[0] || null;

    return {
      totalTasksCount: taskMap.size,
      tasks: Array.from(taskMap.values()),
      activeTaskId: activeTask ? activeTask.id : null,
      queuedTasks,
      runningTasks,
      blockedTasks,
      completedTasks,
      failedTasks,
      cancelledTasks,
      executionOrder,
      unresolvedDependencies,
    };
  }
}
