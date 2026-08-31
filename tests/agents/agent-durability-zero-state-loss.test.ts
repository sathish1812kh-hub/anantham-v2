import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { unlinkSync, existsSync } from "node:fs";
import { AgentManager } from "../../src/agents/agent-manager.js";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository, SessionRepository } from "../../src/persistence/index.js";
import { AgentManifest } from "../../src/domain/agent.js";

const DB_PATH = "test_agent_durability.db";

describe("P6.1 Agents — Durability & Zero State Loss", () => {
  let db: SqliteEngine;
  let eventStore: EventStore;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;

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

    projectRepo.save({
      id: "proj_dur",
      name: "Durability Test Project",
      rootPath: "C:/test_dur",
      status: "active",
      tags: [],
      modelProfile: "m",
      memoryNamespace: "mem",
      orchestrationProfile: "o",
      trustProfile: "developer",
      createdAt: "2026-08-30T20:00:00.000Z",
      lastOpenedAt: "2026-08-30T20:00:00.000Z",
      lastActivityAt: "2026-08-30T20:00:00.000Z",
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
      createdAt: "2026-08-30T20:00:00.000Z",
      updatedAt: "2026-08-30T20:00:00.000Z",
    });
  });

  afterEach(() => {
    db.close();
    if (existsSync(DB_PATH)) unlinkSync(DB_PATH);
    if (existsSync(`${DB_PATH}-wal`)) unlinkSync(`${DB_PATH}-wal`);
    if (existsSync(`${DB_PATH}-shm`)) unlinkSync(`${DB_PATH}-shm`);
  });

  it("persists all agent lifecycle transitions into SQLite WAL EventStore", () => {
    const manager = new AgentManager({ eventStore });

    const manifest: AgentManifest = {
      id: "durable-agent",
      name: "Durable Agent",
      version: "1.0.0",
      role: "State Saver",
      objective: "Ensure state is persisted",
      modelProfile: "fast",
      requiredCapabilities: [],
      tools: [],
      skills: [],
      permissionProfile: "developer",
      executorProfile: "local",
      budget: {},
      contextScope: { includeMemory: true },
      scope: "project",
      projectId: "proj_dur",
    };

    manager.register(manifest);

    const resolveRes = manager.resolveStartup("durable-agent", {
      projectId: "proj_dur",
      sessionId: "sess_dur",
      taskId: "task_dur_01",
    });
    expect(resolveRes.success).toBe(true);

    if (resolveRes.startupPlan) {
      const instance = manager.createInstance(resolveRes.startupPlan);
      manager.stopInstance(instance.instanceId);
    }

    const events = eventStore.getEventsByProject("proj_dur");
    const types = events.map((e) => e.type);

    expect(types).toContain("agent.registered");
    expect(types).toContain("agent.resolving");
    expect(types).toContain("agent.ready");
    expect(types).toContain("agent.started");
    expect(types).toContain("agent.stopped");
  });
});
