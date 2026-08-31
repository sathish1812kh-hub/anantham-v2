import { randomUUID } from "node:crypto";
import {
  type WorkflowDefinition,
  type WorkflowRun,
  type WorkflowScope,
  type PinnedVersions,
  WorkflowRunSchema,
} from "../domain/workflow.js";
import { EventTypes } from "../domain/event.js";
import { EventStore } from "../event-state/event-store.js";
import { WorkflowRepository } from "../persistence/repositories/workflow-repository.js";
import { WorkflowValidator, type WorkflowValidationReport } from "./workflow-validator.js";

export interface RegisterWorkflowResult {
  success: boolean;
  workflow?: WorkflowDefinition;
  validationReport: WorkflowValidationReport;
  errorMessage?: string;
}

export interface WorkflowRegistryOptions {
  workflowRepo: WorkflowRepository;
  eventStore?: EventStore;
  validator?: WorkflowValidator;
}

/**
 * Scoped Workflow Registry & Run Version Pinning Manager.
 * Resolves workflows with strict precedence: project > profile > global > built-in.
 * PRD Part 2 Section 111 & 112.
 */
export class WorkflowRegistry {
  private readonly workflowRepo: WorkflowRepository;
  private readonly eventStore?: EventStore;
  private readonly validator: WorkflowValidator;

  constructor(options: WorkflowRegistryOptions) {
    this.workflowRepo = options.workflowRepo;
    this.eventStore = options.eventStore;
    this.validator = options.validator ?? new WorkflowValidator();
  }

  /**
   * Register and durably persist a validated workflow definition.
   */
  public register(workflow: WorkflowDefinition): RegisterWorkflowResult {
    // 1. Deep Validation
    const report = this.validator.validate(workflow);
    if (!report.valid) {
      return {
        success: false,
        validationReport: report,
        errorMessage: `Workflow validation failed: ${report.errors.join("; ")}`,
      };
    }

    // 2. Durably persist to SQLite
    this.workflowRepo.saveWorkflow(workflow);

    // 3. Emit Audit Event
    if (this.eventStore) {
      this.eventStore.append({
        id: randomUUID(),
        schemaVersion: 1,
        actor: "system",
        timestamp: new Date().toISOString(),
        type: EventTypes.WORKFLOW_REGISTERED,
        projectId: workflow.projectId,
        payload: {
          workflowId: workflow.id,
          name: workflow.name,
          version: workflow.version,
          scope: workflow.scope,
          taskCount: workflow.tasks.length,
        },
      });
    }

    return {
      success: true,
      workflow,
      validationReport: report,
    };
  }

  /**
   * Resolves a workflow definition by name and optional version, obeying scope precedence:
   * project > profile > global > built-in.
   */
  public resolve(
    name: string,
    options?: {
      version?: string;
      projectId?: string;
      preferredScope?: WorkflowScope;
    }
  ): WorkflowDefinition | null {
    const allWorkflows = this.workflowRepo.listWorkflows(options?.projectId);

    // Filter by name and version if specified
    const matching = allWorkflows.filter((w) => {
      if (w.name !== name) return false;
      if (options?.version && w.version !== options.version) return false;
      return true;
    });

    if (matching.length === 0) return null;

    // Sort by scope precedence: project (1) > profile (2) > global (3) > built-in (4)
    const scopeRank: Record<WorkflowScope, number> = {
      project: 1,
      profile: 2,
      global: 3,
      "built-in": 4,
    };

    matching.sort((a, b) => {
      const rankA = scopeRank[a.scope] || 99;
      const rankB = scopeRank[b.scope] || 99;
      if (rankA !== rankB) return rankA - rankB;
      // Secondary: higher SemVer
      return b.version.localeCompare(a.version, undefined, { numeric: true });
    });

    return matching[0] ?? null;
  }

  /**
   * Pin active run configuration snapshot.
   * PRD Part 2 Section 112: "A workflow run must pin workflow version, plugin versions, skill versions, agent versions, model profile."
   */
  public createPinnedVersions(
    workflow: WorkflowDefinition,
    environmentContext?: {
      pluginVersions?: Record<string, string>;
      skillVersions?: Record<string, string>;
      agentVersions?: Record<string, string>;
      modelProfile?: string;
    }
  ): PinnedVersions {
    return {
      workflowVersion: workflow.version,
      pluginVersions: environmentContext?.pluginVersions ?? {},
      skillVersions: environmentContext?.skillVersions ?? {},
      agentVersions: environmentContext?.agentVersions ?? {},
      modelProfile: environmentContext?.modelProfile,
    };
  }

  /**
   * Initialize and persist an active workflow run instance.
   */
  public createWorkflowRun(
    workflow: WorkflowDefinition,
    sessionId: string,
    environmentContext?: {
      pluginVersions?: Record<string, string>;
      skillVersions?: Record<string, string>;
      agentVersions?: Record<string, string>;
      modelProfile?: string;
    }
  ): WorkflowRun {
    const pinned = this.createPinnedVersions(workflow, environmentContext);
    const now = new Date().toISOString();

    const run: WorkflowRun = WorkflowRunSchema.parse({
      id: `run_${randomUUID()}`,
      workflowId: workflow.id,
      projectId: workflow.projectId,
      sessionId,
      status: "QUEUED",
      currentStepIndex: 0,
      completedTasks: [],
      failedTasks: [],
      runningTasks: [],
      taskResults: {},
      pinnedVersions: pinned,
      startedAt: now,
    });

    this.workflowRepo.saveWorkflowRun(run);

    if (this.eventStore) {
      this.eventStore.append({
        id: randomUUID(),
        schemaVersion: 1,
        actor: "system",
        timestamp: now,
        type: EventTypes.WORKFLOW_STARTED,
        projectId: workflow.projectId,
        sessionId,
        payload: {
          runId: run.id,
          workflowId: workflow.id,
          workflowName: workflow.name,
          workflowVersion: workflow.version,
        },
      });
    }

    return run;
  }

  /**
   * Retrieve a workflow by ID.
   */
  public getById(id: string): WorkflowDefinition | null {
    return this.workflowRepo.findWorkflowById(id);
  }

  /**
   * List all workflows for a project (including global/built-in).
   */
  public list(projectId?: string): WorkflowDefinition[] {
    return this.workflowRepo.listWorkflows(projectId);
  }
}
