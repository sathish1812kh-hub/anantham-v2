import { type HarnessEvent } from "../domain/event.js";
import { type EventStore } from "../event-state/event-store.js";
import { type TaskBoardProjection } from "../event-state/projections/task-board-projection.js";
import { type SessionSummaryProjection } from "../event-state/projections/session-summary-projection.js";
import { type ProjectRepository } from "../persistence/repositories/project-repository.js";
import { type SessionRepository } from "../persistence/repositories/session-repository.js";
import { type TaskRepository } from "../persistence/repositories/task-repository.js";
import { type JobRepository } from "../persistence/repositories/job-repository.js";
import { type NodeRepository } from "../persistence/repositories/node-repository.js";
import { type RemoteDispatchRepository } from "../persistence/repositories/remote-dispatch-repository.js";
import { type ArtifactRepository } from "../persistence/repositories/artifact-repository.js";
import { type TuiStatus } from "../domain/tui.js";

export interface TuiStateAdapterOptions {
  eventStore?: EventStore;
  taskBoardProjection?: TaskBoardProjection;
  sessionSummaryProjection?: SessionSummaryProjection;
  projectRepo?: ProjectRepository;
  sessionRepo?: SessionRepository;
  taskRepo?: TaskRepository;
  jobRepo?: JobRepository;
  nodeRepo?: NodeRepository;
  dispatchRepo?: RemoteDispatchRepository;
  artifactRepo?: ArtifactRepository;
  initialProjectId?: string;
  initialSessionId?: string;
}

/**
 * In-memory presentation adapter consuming runtime state and events.
 * PRD Part 1 Section 42 & PRD Part 2 Section 185.
 */
export class TuiStateAdapter {
  private readonly eventStore?: EventStore;
  private readonly taskBoardProjection?: TaskBoardProjection;
  private readonly sessionSummaryProjection?: SessionSummaryProjection;
  private readonly projectRepo?: ProjectRepository;
  private readonly sessionRepo?: SessionRepository;
  private readonly taskRepo?: TaskRepository;
  private readonly jobRepo?: JobRepository;
  private readonly nodeRepo?: NodeRepository;
  private readonly dispatchRepo?: RemoteDispatchRepository;
  private readonly artifactRepo?: ArtifactRepository;

  private activeProjectId?: string;
  private activeSessionId?: string;
  private status: TuiStatus = "NORMAL";
  private recentEvents: HarnessEvent[] = [];
  private eventListenerUnsubscribe?: () => void;
  private onChangeCallbacks: Array<() => void> = [];

  constructor(options: TuiStateAdapterOptions = {}) {
    this.eventStore = options.eventStore;
    this.taskBoardProjection = options.taskBoardProjection;
    this.sessionSummaryProjection = options.sessionSummaryProjection;
    this.projectRepo = options.projectRepo;
    this.sessionRepo = options.sessionRepo;
    this.taskRepo = options.taskRepo;
    this.jobRepo = options.jobRepo;
    this.nodeRepo = options.nodeRepo;
    this.dispatchRepo = options.dispatchRepo;
    this.artifactRepo = options.artifactRepo;

    this.activeProjectId = options.initialProjectId;
    this.activeSessionId = options.initialSessionId;

    this.attachEventListener();
  }

  private attachEventListener(): void {
    if (!this.eventStore) return;

    this.eventListenerUnsubscribe = this.eventStore.subscribe({}, (event: Readonly<HarnessEvent>) => {
      try {
        this.handleEvent(event as HarnessEvent);
      } catch {
        // Strict subscriber isolation: never throw back into EventStore transaction
      }
    });
  }

  public handleEvent(event: HarnessEvent): void {
    this.recentEvents.unshift(event);
    if (this.recentEvents.length > 100) {
      this.recentEvents.pop();
    }

    if (this.taskBoardProjection) {
      this.taskBoardProjection.handleEvent(event);
    }
    if (this.sessionSummaryProjection) {
      this.sessionSummaryProjection.handleEvent(event);
    }

    // Auto-update active project/session if unset
    if (!this.activeProjectId && event.projectId) {
      this.activeProjectId = event.projectId;
    }
    if (!this.activeSessionId && event.sessionId) {
      this.activeSessionId = event.sessionId;
    }

    this.notifyChange();
  }

  public subscribe(callback: () => void): () => void {
    this.onChangeCallbacks.push(callback);
    return () => {
      this.onChangeCallbacks = this.onChangeCallbacks.filter((cb) => cb !== callback);
    };
  }

  private notifyChange(): void {
    for (const cb of this.onChangeCallbacks) {
      try {
        cb();
      } catch {
        // Isolated notification
      }
    }
  }

  public setActiveProject(projectId?: string): void {
    this.activeProjectId = projectId;
    this.notifyChange();
  }

  public getActiveProjectId(): string | undefined {
    return this.activeProjectId;
  }

  public setActiveSession(sessionId?: string): void {
    this.activeSessionId = sessionId;
    this.notifyChange();
  }

  public getActiveSessionId(): string | undefined {
    return this.activeSessionId;
  }

  public setStatus(status: TuiStatus): void {
    this.status = status;
    this.notifyChange();
  }

  public getStatus(): TuiStatus {
    return this.status;
  }

  public getRecentEvents(limit = 20): HarnessEvent[] {
    return this.recentEvents.slice(0, limit);
  }

  public getProjects() {
    return this.projectRepo ? this.projectRepo.list() : [];
  }

  public getSessions(projectId?: string) {
    const targetProject = projectId || this.activeProjectId;
    if (this.sessionRepo && targetProject) {
      return this.sessionRepo.listByProject(targetProject);
    }
    return [];
  }

  public getTasks(sessionId?: string) {
    const targetSession = sessionId || this.activeSessionId;
    if (this.taskRepo && targetSession) {
      return this.taskRepo.listBySession(targetSession);
    }
    return [];
  }

  public getTaskBoardSnapshot(sessionId?: string) {
    const targetSession = sessionId || this.activeSessionId;
    if (this.taskBoardProjection && targetSession) {
      return this.taskBoardProjection.getState(targetSession);
    }
    return undefined;
  }

  public getJobs(projectId?: string) {
    const targetProject = projectId || this.activeProjectId;
    if (this.jobRepo && targetProject) {
      return this.jobRepo.listJobsByProject(targetProject);
    }
    return [];
  }

  public getNodes() {
    return this.nodeRepo ? this.nodeRepo.listAllNodes() : [];
  }

  public getDispatches(nodeId?: string) {
    if (!this.dispatchRepo) return [];
    return nodeId ? this.dispatchRepo.listDispatchesByNode(nodeId) : [];
  }

  public getArtifacts(sessionId?: string) {
    const targetSession = sessionId || this.activeSessionId;
    if (this.artifactRepo && targetSession) {
      return this.artifactRepo.listBySession(targetSession);
    }
    return [];
  }

  public destroy(): void {
    if (this.eventListenerUnsubscribe) {
      this.eventListenerUnsubscribe();
      this.eventListenerUnsubscribe = undefined;
    }
    this.onChangeCallbacks = [];
  }
}
