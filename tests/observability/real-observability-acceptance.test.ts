import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { ObservabilityManager } from "../../src/observability/observability-manager.js";
import { EventTypes } from "../../src/domain/event.js";

describe("P8.5 Observability — Real End-to-End Observability Acceptance Scenario", () => {
  let engine: SqliteEngine;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let taskRepo: TaskRepository;
  let eventStore: EventStore;
  let obsManager: ObservabilityManager;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    projectRepo = new ProjectRepository(engine);
    sessionRepo = new SessionRepository(engine);
    taskRepo = new TaskRepository(engine);
    eventStore = new EventStore(engine);

    projectRepo.save({
      id: "proj_obs_e2e",
      name: "Observability E2E Project",
      rootPath: "/obs",
      status: "active",
      tags: [],
      modelProfile: "default",
      memoryNamespace: "default",
      orchestrationProfile: "default",
      trustProfile: "safe",
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      metadata: {},
    });

    sessionRepo.save({
      id: "sess_obs_e2e",
      projectId: "proj_obs_e2e",
      name: "E2E Session",
      branch: "main",
      status: "active",
      modelProfile: "default",
      keyPoolProfile: "default",
      mode: "interactive",
      permissions: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {},
    });

    obsManager = new ObservabilityManager({
      engine,
      eventStore,
      taskRepo,
    });

    obsManager.start();
  });

  afterEach(() => {
    obsManager.stop();
    engine.close();
  });

  it("captures runtime events into audit log, records telemetry, and exports verified compliance report", async () => {
    const correlationId = "corr_obs_e2e_001";

    // 1. Task Created Event
    eventStore.append({
      id: "evt_obs_task_01",
      schemaVersion: 1,
      projectId: "proj_obs_e2e",
      sessionId: "sess_obs_e2e",
      type: EventTypes.TASK_CREATED,
      actor: "user",
      correlationId,
      timestamp: new Date().toISOString(),
      payload: { objective: "Review codebase" },
    });

    // 2. Tool Requested Event
    eventStore.append({
      id: "evt_obs_tool_req_01",
      schemaVersion: 1,
      projectId: "proj_obs_e2e",
      sessionId: "sess_obs_e2e",
      type: EventTypes.TOOL_REQUESTED,
      actor: "agent",
      correlationId,
      parentEventId: "evt_obs_task_01",
      timestamp: new Date().toISOString(),
      payload: { tool: "fs.read", path: "src/index.ts" },
    });

    // 3. Tool Completed Event
    eventStore.append({
      id: "evt_obs_tool_comp_01",
      schemaVersion: 1,
      projectId: "proj_obs_e2e",
      sessionId: "sess_obs_e2e",
      type: EventTypes.TOOL_COMPLETED,
      actor: "tool",
      correlationId,
      parentEventId: "evt_obs_tool_req_01",
      timestamp: new Date().toISOString(),
      payload: { status: "success" },
    });

    // Allow event subscribers to process
    await new Promise((r) => setTimeout(r, 50));

    // Verify Audit Logger
    const auditRecords = obsManager.auditLogger.query({ projectId: "proj_obs_e2e" });
    expect(auditRecords.length).toBe(3);
    expect(auditRecords.every((r) => r.correlationId === correlationId)).toBe(true);

    // Verify Telemetry Engine
    const metricSummaries = obsManager.telemetry.getMetricSummaries("proj_obs_e2e");
    expect(metricSummaries.length).toBeGreaterThanOrEqual(1);

    // Verify Diagnostic Inspector
    const diagReport = obsManager.diagnostics.inspect();
    expect(diagReport.status).toBe("HEALTHY");

    // Verify Compliance Exporter
    const compReport = obsManager.compliance.exportReport("proj_obs_e2e");
    expect(compReport.totalAuditEvents).toBe(3);
    expect(compReport.chainIntegrityVerified).toBe(true);
  });
});
