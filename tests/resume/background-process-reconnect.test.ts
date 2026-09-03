import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { ProcessReconnectManager } from "../../src/resume/process-reconnect-manager.js";

describe("PRD-RESUME-006: Background Process Reconnection", () => {
  const testDir = join(process.cwd(), ".test_process_reconnect_" + Date.now());
  const dbPath = join(testDir, "test.sqlite");
  let engine: SqliteEngine;
  let taskRepo: TaskRepository;
  let eventStore: EventStore;

  const sessionId = "sess_proc_01";
  const projectId = "prj_proc_01";

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    engine = new SqliteEngine({ path: dbPath });
    engine.open();

    const migrationEngine = new MigrationEngine(engine);
    migrationEngine.migrate();

    const now = new Date().toISOString();
    engine.raw.prepare(`
      INSERT INTO projects (id, name, root_path, status, tags_json, model_profile, memory_namespace, orchestration_profile, trust_profile, created_at, last_opened_at, last_activity_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `).run(projectId, "Process Project", "/tmp/proc", "active", "[]", "default", "mem", "orch", "developer", now, now, now);

    engine.raw.prepare(`
      INSERT INTO sessions (id, project_id, name, branch, status, model_profile, key_pool_profile, mode, permissions_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `).run(sessionId, projectId, "Process Session", "main", "active", "default", "default", "autonomous", "{}", now, now);

    taskRepo = new TaskRepository(engine);
    eventStore = new EventStore(engine);
  });

  afterEach(() => {
    if (engine.isOpen()) {
      engine.close();
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("reattaches to active live running background PID across resume", async () => {
    const manager = new ProcessReconnectManager({
      engine,
      taskRepo,
      eventStore,
      processInspector: async (pid) => {
        if (pid === 55555) {
          return { alive: true, startTime: 1000 };
        }
        return { alive: false };
      },
    });

    manager.registerDetachedProcess({
      executionId: "exec_running",
      taskId: "task_build",
      sessionId,
      projectId,
      command: "npm run build",
      cwd: "/tmp/app",
      pid: 55555,
      processStartTime: 1000,
      stdoutLogPath: "/tmp/stdout.log",
      stderrLogPath: "/tmp/stderr.log",
      sideEffectSafety: "IDEMPOTENT",
      lastHeartbeatAt: Date.now(),
    });

    const report = await manager.reconcileSessionProcesses(sessionId);
    expect(report.totalInspected).toBe(1);
    expect(report.reattachedCount).toBe(1);
    expect(report.details[0].outcome).toBe("REATTACHED_RUNNING");

    const events = eventStore.getEventsBySession(sessionId);
    expect(events.some((e) => e.type === "process.reattached")).toBe(true);
  });

  it("harvests detached process that completed successfully (exit code 0)", async () => {
    const exitPath = join(testDir, "exit_0.txt");
    writeFileSync(exitPath, "0");

    const taskId = "task_harvest_ok";
    const now = new Date().toISOString();
    taskRepo.save({
      id: taskId,
      projectId,
      sessionId,
      objective: "Compile binaries",
      status: "running",
      priority: "normal",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: now,
      updatedAt: now,
    });

    const manager = new ProcessReconnectManager({
      engine,
      taskRepo,
      eventStore,
      processInspector: async () => ({ alive: false }), // Process already finished
    });

    manager.registerDetachedProcess({
      executionId: "exec_done_ok",
      taskId,
      sessionId,
      projectId,
      command: "cargo build --release",
      cwd: "/tmp/app",
      pid: 66666,
      processStartTime: 2000,
      stdoutLogPath: "/tmp/stdout.log",
      stderrLogPath: "/tmp/stderr.log",
      exitCodePath: exitPath,
      sideEffectSafety: "IDEMPOTENT",
      lastHeartbeatAt: Date.now(),
    });

    const report = await manager.reconcileSessionProcesses(sessionId);
    expect(report.harvestedCount).toBe(1);
    expect(report.details[0].outcome).toBe("HARVESTED_COMPLETED");

    // Verify task transitioned to completed
    const task = taskRepo.findById(taskId);
    expect(task?.status).toBe("completed");
  });

  it("handles orphan process gracefully: safe retry on idempotent vs block on non-idempotent", async () => {
    const taskRetryId = "task_idempotent";
    const taskBlockId = "task_non_idempotent";
    const now = new Date().toISOString();

    taskRepo.save({
      id: taskRetryId,
      projectId,
      sessionId,
      objective: "Run unit tests",
      status: "running",
      priority: "normal",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: now,
      updatedAt: now,
    });

    taskRepo.save({
      id: taskBlockId,
      projectId,
      sessionId,
      objective: "Deploy to production Kubernetes",
      status: "running",
      priority: "critical",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: now,
      updatedAt: now,
    });

    const manager = new ProcessReconnectManager({
      engine,
      taskRepo,
      eventStore,
      processInspector: async () => ({ alive: false }), // Died during host crash
    });

    // 1. Idempotent process
    manager.registerDetachedProcess({
      executionId: "exec_idempotent",
      taskId: taskRetryId,
      sessionId,
      projectId,
      command: "npm test",
      cwd: "/tmp/app",
      pid: 77771,
      processStartTime: 3000,
      stdoutLogPath: "/tmp/stdout.log",
      stderrLogPath: "/tmp/stderr.log",
      sideEffectSafety: "IDEMPOTENT",
      lastHeartbeatAt: Date.now(),
    });

    // 2. Non-idempotent process
    manager.registerDetachedProcess({
      executionId: "exec_non_idempotent",
      taskId: taskBlockId,
      sessionId,
      projectId,
      command: "kubectl apply -f prod.yaml",
      cwd: "/tmp/app",
      pid: 77772,
      processStartTime: 3000,
      stdoutLogPath: "/tmp/stdout.log",
      stderrLogPath: "/tmp/stderr.log",
      sideEffectSafety: "NON_IDEMPOTENT",
      lastHeartbeatAt: Date.now(),
    });

    const report = await manager.reconcileSessionProcesses(sessionId);
    expect(report.orphanedCount).toBe(2);

    const taskRetry = taskRepo.findById(taskRetryId);
    expect(taskRetry?.status).toBe("queued"); // Safe retry

    const taskBlock = taskRepo.findById(taskBlockId);
    expect(taskBlock?.status).toBe("blocked"); // Blocked for human review
  });

  it("detects PID recycling collision and marks process lost", async () => {
    const manager = new ProcessReconnectManager({
      engine,
      taskRepo,
      eventStore,
      processInspector: async () => ({
        alive: true,
        startTime: 9999999, // Completely different start time!
      }),
    });

    manager.registerDetachedProcess({
      executionId: "exec_recycled",
      taskId: "task_recycled",
      sessionId,
      projectId,
      command: "long_job",
      cwd: "/tmp",
      pid: 1234,
      processStartTime: 1000,
      stdoutLogPath: "/tmp/out",
      stderrLogPath: "/tmp/err",
      sideEffectSafety: "IDEMPOTENT",
      lastHeartbeatAt: Date.now(),
    });

    const report = await manager.reconcileSessionProcesses(sessionId);
    expect(report.details[0].outcome).toBe("PID_RECYCLED_MISMATCH");
  });
});
