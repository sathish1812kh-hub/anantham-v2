import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { unlinkSync, existsSync } from "node:fs";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository, SessionRepository, TaskRepository, LeaseRepository } from "../../src/persistence/index.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";
import { Task } from "../../src/domain/task.js";

const DB_PATH = "test_task_durability.db";

describe("P6.2 Tasks — Durability & Zero State Loss", () => {
  let db: SqliteEngine;
  let eventStore: EventStore;
  let taskRepo: TaskRepository;
  let leaseRepo: LeaseRepository;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let claimManager: TaskClaimManager;

  beforeEach(() => {
    if (existsSync(DB_PATH)) unlinkSync(DB_PATH);
    if (existsSync(`${DB_PATH}-wal`)) unlinkSync(`${DB_PATH}-wal`);
    if (existsSync(`${DB_PATH}-shm`)) unlinkSync(`${DB_PATH}-shm`);

    db = new SqliteEngine({ path: DB_PATH });
    db.open();
    const migrator = new MigrationEngine(db);
    migrator.migrate();

    eventStore = new EventStore(db);
    projectRepo = new ProjectRepository(db);
    sessionRepo = new SessionRepository(db);
    taskRepo = new TaskRepository(db);
    leaseRepo = new LeaseRepository(db);

    claimManager = new TaskClaimManager({
      engine: db,
      taskRepo,
      leaseRepo,
      eventStore,
    });

    projectRepo.save({
      id: "proj_dur",
      name: "Durability Project",
      rootPath: "C:/dur_proj",
      status: "active",
      tags: [],
      modelProfile: "m",
      memoryNamespace: "mem",
      orchestrationProfile: "o",
      trustProfile: "developer",
      createdAt: "2026-08-31T00:00:00.000Z",
      lastOpenedAt: "2026-08-31T00:00:00.000Z",
      lastActivityAt: "2026-08-31T00:00:00.000Z",
    });

    sessionRepo.save({
      id: "sess_dur",
      projectId: "proj_dur",
      name: "Durability Session",
      branch: "main",
      status: "active",
      modelProfile: "m",
      keyPoolProfile: "k",
      mode: "interactive",
      permissions: {},
      createdAt: "2026-08-31T00:00:00.000Z",
      updatedAt: "2026-08-31T00:00:00.000Z",
    });
  });

  afterEach(() => {
    db.close();
    if (existsSync(DB_PATH)) unlinkSync(DB_PATH);
    if (existsSync(`${DB_PATH}-wal`)) unlinkSync(`${DB_PATH}-wal`);
    if (existsSync(`${DB_PATH}-shm`)) unlinkSync(`${DB_PATH}-shm`);
  });

  it("persists all task claim and lease transitions to SQLite WAL and records audit events in EventStore", () => {
    const task: Task = {
      id: "task_dur_01",
      projectId: "proj_dur",
      sessionId: "sess_dur",
      objective: "Durable persistence test",
      status: "queued",
      priority: "critical",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: "2026-08-31T00:01:00.000Z",
      updatedAt: "2026-08-31T00:01:00.000Z",
    };
    taskRepo.save(task);

    // 1. Claim task
    const claimRes = claimManager.claimTask({
      taskId: "task_dur_01",
      agentId: "agent_durable",
      instanceId: "inst_dur_01",
      projectId: "proj_dur",
      sessionId: "sess_dur",
      ttlMs: 30000,
    });
    expect(claimRes.success).toBe(true);
    const lease = claimRes.lease!;

    // 2. Heartbeat
    claimManager.heartbeat({
      leaseId: lease.id,
      agentId: "agent_durable",
      instanceId: "inst_dur_01",
      generation: lease.generation,
      currentAction: "persisting",
    });

    // 3. Complete
    claimManager.completeTask(
      "task_dur_01",
      lease.id,
      lease.generation,
      { output: "Durable success" }
    );

    // 4. Verify EventStore audit trail
    const events = eventStore.getEventsByProject("proj_dur");
    const types = events.map((e) => e.type);

    expect(types).toContain("task.claimed");
    expect(types).toContain("task.lease_acquired");
    expect(types).toContain("task.heartbeat");
    expect(types).toContain("task.completed");
    expect(types).toContain("task.released");
  });
});
