import type { SqliteEngine } from "../persistence/sqlite-engine.js";
import type { ProjectRepository } from "../persistence/repositories/project-repository.js";
import type { SessionRepository } from "../persistence/repositories/session-repository.js";
import type { TaskRepository } from "../persistence/repositories/task-repository.js";
import type { CheckpointRepository } from "../persistence/repositories/checkpoint-repository.js";
import type { ArtifactRepository } from "../persistence/repositories/artifact-repository.js";
import type { EventRepository } from "../persistence/repositories/event-repository.js";
import type { EventStore } from "../event-state/event-store.js";
import type { ProjectionManager } from "../event-state/projections/projection-manager.js";
import { LeaseManager } from "../recovery/lease-manager.js";
import { CheckpointValidator } from "../recovery/checkpoint-validator.js";
import { reconstructSessionState } from "../event-state/reconstruction/session-reconstruct.js";
import { TaskDagRestorer } from "./task-dag-restorer.js";
import { PendingApprovalRestorer } from "./pending-approval-restorer.js";
import {
  type ResumeRequest,
  type ResumeResult,
  type ResumeValidationResult,
  ResumeResultSchema,
} from "./resume-contract.js";
import { EventTypes } from "../domain/event.js";

export interface SessionResumeEngineOptions {
  engine: SqliteEngine;
  projectRepo: ProjectRepository;
  sessionRepo: SessionRepository;
  taskRepo: TaskRepository;
  checkpointRepo: CheckpointRepository;
  artifactRepo: ArtifactRepository;
  eventRepo: EventRepository;
  eventStore: EventStore;
  projectionManager?: ProjectionManager;
  leaseManager?: LeaseManager;
}

export class SessionResumeEngine {
  private readonly engine: SqliteEngine;
  private readonly projectRepo: ProjectRepository;
  private readonly sessionRepo: SessionRepository;
  private readonly taskRepo: TaskRepository;
  private readonly checkpointRepo: CheckpointRepository;
  private readonly artifactRepo: ArtifactRepository;
  private readonly eventRepo: EventRepository;
  private readonly eventStore: EventStore;
  private readonly projectionManager?: ProjectionManager;
  private readonly leaseManager: LeaseManager;

  constructor(options: SessionResumeEngineOptions) {
    this.engine = options.engine;
    this.projectRepo = options.projectRepo;
    this.sessionRepo = options.sessionRepo;
    this.taskRepo = options.taskRepo;
    this.checkpointRepo = options.checkpointRepo;
    this.artifactRepo = options.artifactRepo;
    this.eventRepo = options.eventRepo;
    this.eventStore = options.eventStore;
    this.projectionManager = options.projectionManager;
    this.leaseManager = options.leaseManager ?? new LeaseManager({ taskRepo: this.taskRepo });
  }

  /**
   * Executes the full deterministic session resume and runtime reconstruction algorithm.
   * PRD Part 1 Section 55-58 & PRD Part 3 Section 15-16.
   */
  public async resume(request: ResumeRequest): Promise<ResumeResult> {
    const resumeId = `res_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Resolve Target Session and Project
    let targetSessionId: string | null = null;
    let targetCheckpointId: string | null = null;

    const target = request.target;
    switch (target.type) {
      case "last": {
        if (target.projectId) {
          const sessions = this.sessionRepo.listByProject(target.projectId);
          const first = sessions[0];
          if (!first) {
            throw new Error(`No sessions found for project ID '${target.projectId}'.`);
          }
          targetSessionId = first.id;
        } else {
          // Query latest active session across all projects
          const row = this.engine.raw
            .prepare("SELECT id FROM sessions ORDER BY updated_at DESC LIMIT 1;")
            .get() as { id: string } | undefined;
          if (!row) {
            throw new Error("No existing sessions found in database to resume.");
          }
          targetSessionId = row.id;
        }
        break;
      }

      case "session":
        targetSessionId = target.sessionId;
        break;

      case "project": {
        const projects = this.projectRepo.list();
        const matched = projects.find((p) => p.name.toLowerCase() === target.projectName.toLowerCase());
        if (!matched) {
          throw new Error(`Project '${target.projectName}' not found.`);
        }
        const sessions = this.sessionRepo.listByProject(matched.id);
        const first = sessions[0];
        if (!first) {
          throw new Error(`No sessions found for project '${matched.name}'.`);
        }
        targetSessionId = first.id;
        break;
      }

      case "checkpoint": {
        targetCheckpointId = target.checkpointId;
        const chk = this.checkpointRepo.findById(targetCheckpointId);
        if (!chk) {
          throw new Error(`Checkpoint '${targetCheckpointId}' not found.`);
        }
        targetSessionId = chk.sessionId;
        break;
      }
    }

    if (!targetSessionId) {
      throw new Error("Unable to resolve target session for resume.");
    }

    // 2. Load Session and Project
    const session = this.sessionRepo.findById(targetSessionId);
    if (!session) {
      throw new Error(`Session '${targetSessionId}' not found.`);
    }

    const project = this.projectRepo.findById(session.projectId);
    if (!project) {
      throw new Error(`Project '${session.projectId}' referenced by session '${session.id}' not found.`);
    }

    // 3. Locate & Validate Checkpoint
    let checkpoint = targetCheckpointId
      ? this.checkpointRepo.findById(targetCheckpointId)
      : this.checkpointRepo.findLatestBySession(session.id);

    let checkpointValid = true;
    if (checkpoint) {
      const chkValidation = await CheckpointValidator.validateComplete(checkpoint, {
        artifactRepo: this.artifactRepo,
        eventRepo: this.eventRepo,
      });

      if (!chkValidation.isValid) {
        checkpointValid = false;
        warnings.push(`Checkpoint '${checkpoint.id}' failed integrity validation: ${chkValidation.errors.join("; ")}`);
        // Fallback: If target was not explicitly checkpoint ID, proceed with pure event replay
        if (target.type === "checkpoint") {
          throw new Error(`Target checkpoint '${checkpoint.id}' is corrupted: ${chkValidation.errors.join("; ")}`);
        }
      }
    }

    // 4. Query Authoritative Events
    const events = this.eventStore.getEventsBySession(session.id);
    const eventOffset = events.length;

    // 5. Reconstruct Aggregate Session State
    const sessionState = reconstructSessionState(session.id, events);

    // 6. Synchronize / Rebuild Projections
    if (this.projectionManager) {
      this.projectionManager.rebuildAll();
    }

    // 7. Stale Lease Reclamation & Task Interruption Handling
    this.leaseManager.reclaimStaleLeases();

    // 8. Restore Task DAG & Execution Topology
    const rawTasks = this.taskRepo.listBySession(session.id);
    const taskDAG = TaskDagRestorer.restoreDAG(rawTasks, {
      taskRepo: this.taskRepo,
      reconcileInterruptedTasks: !request.options?.dryRun,
    });

    // 9. Restore Pending Approvals Queue
    const pendingApprovals = PendingApprovalRestorer.restorePendingApprovals(events);

    // 10. Validate Artifacts
    const artifacts = this.artifactRepo.listBySession(session.id);
    const missingArtifactIds: string[] = [];
    for (const art of artifacts) {
      if (!art.sha256 || art.sha256.length !== 64) {
        missingArtifactIds.push(art.id);
      }
    }

    // 11. Compile Validation Result
    const validation: ResumeValidationResult = {
      isValid: errors.length === 0,
      projectValid: Boolean(project),
      sessionValid: Boolean(session),
      checkpointValid,
      gitStateValid: true,
      permissionsValid: Boolean(session.permissions),
      errors,
      warnings,
    };

    // 12. Record Durable Resume Event in EventStore (if not dryRun)
    if (!request.options?.dryRun) {
      this.eventStore.append({
        id: `evt_res_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        schemaVersion: 1,
        projectId: project.id,
        sessionId: session.id,
        type: EventTypes.SESSION_RESUMED,
        actor: "user",
        payload: {
          resumeId,
          targetType: target.type,
          restoredTasksCount: taskDAG.totalTasksCount,
          activeTaskId: taskDAG.activeTaskId,
          pendingApprovalsCount: pendingApprovals.pendingApprovalsCount,
          validationStatus: validation.isValid ? "VALID" : "INVALID",
        },
        timestamp: new Date().toISOString(),
      });
    }

    const result: ResumeResult = {
      success: true,
      resumeId,
      projectId: project.id,
      sessionId: session.id,
      project,
      session,
      checkpoint: checkpoint ?? undefined,
      sessionState,
      taskDAG,
      pendingApprovals,
      artifactsSummary: {
        totalArtifactsCount: artifacts.length,
        validArtifactsCount: artifacts.length - missingArtifactIds.length,
        missingArtifactIds,
      },
      eventOffset,
      resumedAt: new Date().toISOString(),
      message: `Session '${session.name}' (${session.id}) successfully resumed with ${taskDAG.totalTasksCount} tasks (${taskDAG.queuedTasks.length} queued, ${pendingApprovals.pendingApprovalsCount} pending approvals).`,
    };

    return ResumeResultSchema.parse(result) as ResumeResult;
  }
}
