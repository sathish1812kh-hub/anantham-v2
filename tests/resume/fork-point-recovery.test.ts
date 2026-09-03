import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { EventRepository } from "../../src/persistence/repositories/event-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { ForkPointRecoveryManager } from "../../src/resume/fork-point-recovery-manager.js";
import { EventTypes } from "../../src/domain/event.js";

describe("F-REC-13: Session Fork Point-in-Time Recovery", () => {
  const testDir = join(process.cwd(), ".test_fork_recovery_" + Date.now());
  const dbPath = join(testDir, "test.sqlite");
  let engine: SqliteEngine;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let taskRepo: TaskRepository;
  let eventRepo: EventRepository;
  let eventStore: EventStore;
  let forkRecoveryManager: ForkPointRecoveryManager;

  const projectId = "prj_fork_01";
  const parentSessionId = "sess_parent_01";

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    engine = new SqliteEngine({ path: dbPath });
    engine.open();

    const migrationEngine = new MigrationEngine(engine);
    migrationEngine.migrate();

    projectRepo = new ProjectRepository(engine);
    sessionRepo = new SessionRepository(engine);
    taskRepo = new TaskRepository(engine);
    eventRepo = new EventRepository(engine);
    eventStore = new EventStore(engine);

    const now = new Date().toISOString();
    projectRepo.save({
      id: projectId,
      name: "Fork Parent Project",
      rootPath: "/tmp/fork",
      status: "active",
      tags: [],
      modelProfile: "claude-3-5-sonnet",
      memoryNamespace: "fork-mem",
      orchestrationProfile: "standard",
      trustProfile: "developer",
      createdAt: now,
      lastOpenedAt: now,
      lastActivityAt: now,
    });

    sessionRepo.save({
      id: parentSessionId,
      projectId,
      name: "Parent Session",
      branch: "main",
      status: "active",
      modelProfile: "claude-3-5-sonnet",
      keyPoolProfile: "default",
      mode: "autonomous",
      permissions: { allowShell: true },
      createdAt: now,
      updatedAt: now,
    });

    forkRecoveryManager = new ForkPointRecoveryManager({
      engine,
      sessionRepo,
      taskRepo,
      eventRepo,
      eventStore,
    });
  });

  afterEach(() => {
    if (engine.isOpen()) {
      engine.close();
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("previews state and task DAG at proposed fork point event without mutating database", async () => {
    eventStore.append({
      id: "evt_p1",
      schemaVersion: 1,
      projectId,
      sessionId: parentSessionId,
      type: EventTypes.SESSION_CREATED,
      actor: "user",
      timestamp: "2026-09-01T10:00:00.000Z",
      payload: { name: "Parent Session" },
    });

    eventStore.append({
      id: "evt_p2",
      schemaVersion: 1,
      projectId,
      sessionId: parentSessionId,
      taskId: "task_01",
      type: EventTypes.TASK_CREATED,
      actor: "agent",
      timestamp: "2026-09-01T10:05:00.000Z",
      payload: { objective: "Implement parser" },
    });

    eventStore.append({
      id: "evt_p3",
      schemaVersion: 1,
      projectId,
      sessionId: parentSessionId,
      taskId: "task_01",
      type: EventTypes.TASK_FAILED,
      actor: "agent",
      timestamp: "2026-09-01T10:10:00.000Z",
      payload: { error: "Fatal parser crash" },
    });

    const preview = await forkRecoveryManager.previewForkPoint(parentSessionId, { eventId: "evt_p3" });
    expect(preview.sourceSessionId).toBe(parentSessionId);
    expect(preview.forkAtEventId).toBe("evt_p3");
    expect(preview.tasksAtFork.length).toBe(1);
    expect(preview.tasksAtFork[0].status).toBe("failed");
    expect(preview.tasksAtFork[0].reconciledStatus).toBe("queued");
  });

  it("recovers from fork point: creates child session, reconciles failed tasks to queued, and preserves parent immutability", async () => {
    eventStore.append({
      id: "evt_init",
      schemaVersion: 1,
      projectId,
      sessionId: parentSessionId,
      type: EventTypes.SESSION_CREATED,
      actor: "user",
      timestamp: "2026-09-01T10:00:00.000Z",
      payload: { name: "Parent Session" },
    });

    eventStore.append({
      id: "evt_t1",
      schemaVersion: 1,
      projectId,
      sessionId: parentSessionId,
      taskId: "task_crashed",
      type: EventTypes.TASK_CREATED,
      actor: "agent",
      timestamp: "2026-09-01T10:01:00.000Z",
      payload: { objective: "Refactor core" },
    });

    eventStore.append({
      id: "evt_t2",
      schemaVersion: 1,
      projectId,
      sessionId: parentSessionId,
      taskId: "task_crashed",
      type: EventTypes.TASK_STARTED,
      actor: "agent",
      agentId: "worker_1",
      timestamp: "2026-09-01T10:02:00.000Z",
      payload: {},
    });

    const parentEventsBefore = eventStore.getEventsBySession(parentSessionId);
    const parentSessionBefore = sessionRepo.findById(parentSessionId);

    const result = await forkRecoveryManager.recoverFromForkPoint({
      sourceSessionId: parentSessionId,
      forkAtEventId: "evt_t2",
      newBranchName: "feature/recovery-branch",
      reconcileTasks: true,
      reason: "Recovery after simulated worker crash",
    });

    expect(result.success).toBe(true);
    expect(result.newBranch).toBe("feature/recovery-branch");
    expect(result.newSession.parentSessionId).toBe(parentSessionId);
    expect(result.reconciledTasks.length).toBe(1);
    expect(result.reconciledTasks[0].oldStatus).toBe("running");
    expect(result.reconciledTasks[0].newStatus).toBe("queued");

    // INVARIANT CHECK: Parent session and event log must be 100% untouched
    expect(result.parentSessionUntouched).toBe(true);
    const parentEventsAfter = eventStore.getEventsBySession(parentSessionId);
    expect(parentEventsAfter.length).toBe(parentEventsBefore.length);
    const parentSessionAfter = sessionRepo.findById(parentSessionId);
    expect(parentSessionAfter).toEqual(parentSessionBefore);

    // Child session has newly cloned task in queued status
    const childTasks = taskRepo.listBySession(result.forkedSessionId);
    expect(childTasks.length).toBe(1);
    expect(childTasks[0].status).toBe("queued");
  });

  it("rejects fork recovery if target event ID does not belong to source session", async () => {
    const safety = forkRecoveryManager.validateForkSafety(parentSessionId, "non_existent_event_id");
    expect(safety.safe).toBe(false);
    expect(safety.errors.length).toBeGreaterThan(0);

    await expect(
      forkRecoveryManager.recoverFromForkPoint({
        sourceSessionId: parentSessionId,
        forkAtEventId: "non_existent_event_id",
        newBranchName: "bad-branch",
      })
    ).rejects.toThrow();
  });
});
