import { AgentStartupPlan } from "../domain/agent.js";
import { TaskBoardFilter } from "../domain/lease.js";
import { Task, TaskPriority } from "../domain/task.js";
import { LeaseRepository } from "../persistence/repositories/lease-repository.js";
import { TaskRepository } from "../persistence/repositories/task-repository.js";

export interface TaskBoardOptions {
  taskRepo: TaskRepository;
  leaseRepo?: LeaseRepository;
}

export interface TaskBoardColumns {
  queued: Task[];
  available: Task[];
  claimed: Task[];
  running: Task[];
  blocked: Task[];
  waitingApproval: Task[];
  completed: Task[];
  failed: Task[];
  cancelled: Task[];
}

const PRIORITY_WEIGHTS: Record<TaskPriority, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
};

/**
 * Task Board query and eligibility evaluation service.
 * PRD Part 2 Section 34, Engineering Playbook Section 51.
 */
export class TaskBoard {
  private readonly taskRepo: TaskRepository;
  private readonly leaseRepo?: LeaseRepository;

  constructor(options: TaskBoardOptions) {
    this.taskRepo = options.taskRepo;
    this.leaseRepo = options.leaseRepo;
  }

  public get leaseRepository(): LeaseRepository | undefined {
    return this.leaseRepo;
  }

  /**
   * Query all tasks matching board filter.
   */
  public listTasks(filter: TaskBoardFilter): Task[] {
    let tasks: Task[] = [];
    if (filter.sessionId) {
      tasks = this.taskRepo.listBySession(filter.sessionId);
    } else {
      tasks = this.getTasksForProject(filter.projectId);
    }

    if (filter.status && filter.status.length > 0) {
      tasks = tasks.filter((t) => filter.status!.includes(t.status));
    }

    if (filter.agentRole) {
      tasks = tasks.filter((t) => !t.agentRole || t.agentRole === filter.agentRole);
    }

    if (filter.priority) {
      tasks = tasks.filter((t) => t.priority === filter.priority);
    }

    tasks.sort(this.compareTasks);

    if (filter.limit && filter.limit > 0) {
      tasks = tasks.slice(0, filter.limit);
    }

    return tasks;
  }

  /**
   * Deterministically evaluate and list eligible tasks for an agent's startup plan.
   * PRD Part 2 Section 34.
   */
  public listEligibleTasks(
    startupPlan: AgentStartupPlan,
    filter?: Partial<TaskBoardFilter>
  ): Task[] {
    // 1. Fetch candidate tasks in project
    const allTasks = this.getTasksForProject(startupPlan.projectId);

    // 2. Filter for claimable status (queued or available)
    const claimableTasks = allTasks.filter(
      (t) => t.status === "queued" || t.status === "available"
    );

    // 3. Evaluate eligibility rules
    const eligibleTasks = claimableTasks.filter((task) => {
      // A. Session match (if scoped)
      if (filter?.sessionId && task.sessionId !== filter.sessionId) {
        return false;
      }

      // B. Dependency satisfaction: every dependency must be completed
      if (task.dependencies.length > 0) {
        const areDepsMet = task.dependencies.every((depId) => {
          const depTask = this.taskRepo.findById(depId);
          return depTask && depTask.status === "completed";
        });
        if (!areDepsMet) {
          return false;
        }
      }

      // C. Agent Role match (if required by task)
      if (task.agentRole && task.agentRole !== startupPlan.role) {
        return false;
      }

      // D. Model Profile match (if required by task)
      if (
        task.modelProfile &&
        task.modelProfile !== startupPlan.resolvedModel.modelId &&
        task.modelProfile !== "default"
      ) {
        return false;
      }

      // E. Permission Profile match (if required by task)
      if (task.permissionProfile) {
        if (
          task.permissionProfile === "admin" &&
          !startupPlan.grantedPermissions.includes("shell.execute")
        ) {
          return false;
        }
      }

      // F. Budget & Resource Check
      const maxTokens = startupPlan.budget.maxTokens ?? 100000;
      const maxCostUsd = startupPlan.budget.maxCostUsd ?? 5.0;
      if (maxTokens <= 0 || maxCostUsd <= 0) {
        return false;
      }

      // G. Optional filter criteria
      if (filter?.priority && task.priority !== filter.priority) {
        return false;
      }

      return true;
    });

    // 4. Deterministic Sort: Priority DESC, then CreatedAt ASC
    eligibleTasks.sort(this.compareTasks);

    if (filter?.limit && filter.limit > 0) {
      return eligibleTasks.slice(0, filter.limit);
    }

    return eligibleTasks;
  }

  /**
   * Rebuildable multi-column board view.
   */
  public getTaskBoardState(projectId: string, sessionId?: string): TaskBoardColumns {
    const tasks = sessionId
      ? this.taskRepo.listBySession(sessionId)
      : this.getTasksForProject(projectId);

    return {
      queued: tasks.filter((t) => t.status === "queued"),
      available: tasks.filter((t) => t.status === "available"),
      claimed: tasks.filter((t) => t.status === "claimed"),
      running: tasks.filter((t) => t.status === "running"),
      blocked: tasks.filter((t) => t.status === "blocked"),
      waitingApproval: tasks.filter((t) => t.status === "waiting_approval"),
      completed: tasks.filter((t) => t.status === "completed"),
      failed: tasks.filter((t) => t.status === "failed"),
      cancelled: tasks.filter((t) => t.status === "cancelled"),
    };
  }

  /**
   * Helper to retrieve all tasks for a project.
   */
  private getTasksForProject(projectId: string): Task[] {
    try {
      const engine = (this.taskRepo as any).engine;
      if (engine?.raw) {
        const stmt = engine.raw.prepare(`
          SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at ASC;
        `);
        const rows = stmt.all(projectId);
        return rows.map((r: any) => (this.taskRepo as any).rowToTask(r));
      }
    } catch {
      // fallback
    }
    return [];
  }

  /**
   * Deterministic task comparison comparator.
   */
  private compareTasks(a: Task, b: Task): number {
    const weightA = PRIORITY_WEIGHTS[a.priority] ?? 2;
    const weightB = PRIORITY_WEIGHTS[b.priority] ?? 2;

    if (weightA !== weightB) {
      return weightB - weightA; // Higher priority first
    }

    return a.createdAt.localeCompare(b.createdAt); // Earlier created first
  }
}
