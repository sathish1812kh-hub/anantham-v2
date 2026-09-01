import { randomUUID } from "node:crypto";
import { type TaskRepository } from "../persistence/repositories/task-repository.js";
import { type SessionRepository } from "../persistence/repositories/session-repository.js";
import {
  type CicdTriggerPayload,
  CicdTriggerPayloadSchema,
} from "../domain/integration.js";
import { type Task } from "../domain/task.js";
import { EventTypes } from "../domain/event.js";
import { type EventStore } from "../event-state/event-store.js";

export interface CicdAdapterOptions {
  taskRepo: TaskRepository;
  sessionRepo: SessionRepository;
  eventStore: EventStore;
}

/**
 * CI/CD Pipeline Integration Adapter.
 * PRD Part 2 Section 240.
 */
export class CicdAdapter {
  private readonly taskRepo: TaskRepository;
  private readonly sessionRepo: SessionRepository;
  private readonly eventStore: EventStore;

  constructor(options: CicdAdapterOptions) {
    this.taskRepo = options.taskRepo;
    this.sessionRepo = options.sessionRepo;
    this.eventStore = options.eventStore;
  }

  /**
   * Parse raw CI payload into typed trigger payload.
   */
  public parsePayload(raw: unknown): CicdTriggerPayload {
    return CicdTriggerPayloadSchema.parse(raw);
  }

  /**
   * Translate a CI/CD trigger into a controlled runtime Task inside a CI session.
   */
  public triggerCiTask(projectId: string, payload: CicdTriggerPayload): Task {
    // 1. Resolve or create CI session for project
    let sessions = this.sessionRepo.listByProject(projectId);
    let ciSession = sessions.find((s) => s.branch === payload.branch && s.status === "active");

    const now = new Date().toISOString();
    if (!ciSession) {
      ciSession = {
        id: `sess_ci_${randomUUID().slice(0, 8)}`,
        projectId,
        name: `CI Pipeline ${payload.pipelineId} (${payload.branch})`,
        branch: payload.branch,
        status: "active",
        modelProfile: "default",
        keyPoolProfile: "default",
        mode: "interactive",
        permissions: {},
        createdAt: now,
        updatedAt: now,
        metadata: { pipelineId: payload.pipelineId, commitSha: payload.commitSha },
      };
      this.sessionRepo.save(ciSession);
    }

    // 2. Create authoritative task
    const taskId = `task_ci_${randomUUID().slice(0, 8)}`;
    const task: Task = {
      id: taskId,
      projectId,
      sessionId: ciSession.id,
      objective: `Execute CI Pipeline ${payload.pipelineId} on commit ${payload.commitSha.slice(0, 7)}`,
      status: "available",
      priority: "high",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: now,
      updatedAt: now,
      metadata: {
        pipelineId: payload.pipelineId,
        triggerType: payload.triggerType,
        commitSha: payload.commitSha,
        workflowId: payload.workflowId,
      },
    };

    this.taskRepo.save(task);

    // 3. Emit CI triggered event
    this.eventStore.append({
      id: `evt_${taskId}_cicd`,
      schemaVersion: 1,
      projectId,
      sessionId: ciSession.id,
      taskId,
      type: EventTypes.INTEGRATION_CICD_TRIGGERED,
      actor: "system",
      timestamp: now,
      payload: {
        pipelineId: payload.pipelineId,
        branch: payload.branch,
        commitSha: payload.commitSha,
        triggerType: payload.triggerType,
      },
    });

    return task;
  }
}
