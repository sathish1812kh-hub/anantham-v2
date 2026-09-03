import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { DataRetentionManager, QuotaExceededError } from "../../src/governance/data-retention-manager.js";

describe("PRD-GOV-001: Data Retention, Quotas & Resource Management", () => {
  const testDir = join(process.cwd(), ".test_data_retention_" + Date.now());
  const dbPath = join(testDir, "test.sqlite");
  let engine: SqliteEngine;
  let eventStore: EventStore;
  let retentionManager: DataRetentionManager;

  const projectId = "prj_gov_01";
  const sessionId = "sess_gov_01";

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
    `).run(projectId, "Retention Project", "/tmp/ret", "active", "[]", "default", "mem", "orch", "developer", now, now, now);

    engine.raw.prepare(`
      INSERT INTO sessions (id, project_id, name, branch, status, model_profile, key_pool_profile, mode, permissions_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `).run(sessionId, projectId, "Governance Session", "main", "active", "default", "default", "autonomous", "{}", now, now);

    eventStore = new EventStore(engine);

    retentionManager = new DataRetentionManager({
      engine,
      eventStore,
      policy: {
        maxEventsPerSession: 5,
        maxArtifactsPerSession: 3,
        retentionDays: 30,
        enforcementMode: "hard_reject",
      },
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

  it("checks quota and passes when events and artifacts are within limits", async () => {
    eventStore.append({
      id: "evt_q_1",
      schemaVersion: 1,
      projectId,
      sessionId,
      type: "task.started",
      actor: "system",
      timestamp: new Date().toISOString(),
      payload: {},
    });

    const usage = await retentionManager.checkQuota(sessionId);
    expect(usage.withinLimits).toBe(true);
    expect(usage.currentEventsCount).toBe(1);
    expect(usage.violations.length).toBe(0);

    await expect(retentionManager.assertQuotaWithinLimits(sessionId)).resolves.not.toThrow();
  });

  it("throws QuotaExceededError when hard_reject mode exceeds maximum events quota", async () => {
    // Append 5 events to hit maxEventsPerSession = 5
    for (let i = 1; i <= 5; i++) {
      eventStore.append({
        id: "evt_q_limit_" + i,
        schemaVersion: 1,
        projectId,
        sessionId,
        type: "agent.step",
        actor: "agent",
        timestamp: new Date().toISOString(),
        payload: { step: i },
      });
    }

    const usage = await retentionManager.checkQuota(sessionId);
    expect(usage.withinLimits).toBe(false);
    expect(usage.violations.some((v) => v.includes("EVENT_QUOTA_EXCEEDED"))).toBe(true);

    await expect(retentionManager.assertQuotaWithinLimits(sessionId)).rejects.toThrow(QuotaExceededError);
  });

  it("enforces retention policy purging sessions older than retention cutoff date", async () => {
    const baseNow = Date.now();
    const sixtyDaysAgo = new Date(baseNow - 60 * 24 * 60 * 60 * 1000).toISOString();
    const oldSessionId = "sess_old_purge";


    engine.raw.prepare(`
      INSERT INTO sessions (id, project_id, name, branch, status, model_profile, key_pool_profile, mode, permissions_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `).run(oldSessionId, projectId, "Old Session", "main", "active", "default", "default", "autonomous", "{}", sixtyDaysAgo, sixtyDaysAgo);

    eventStore.append({
      id: "evt_old_1",
      schemaVersion: 1,
      projectId,
      sessionId: oldSessionId,
      type: "history.event",
      actor: "system",
      timestamp: sixtyDaysAgo,
      payload: {},
    });

    // 1. Dry run
    const dryRunReport = await retentionManager.enforceRetentionPolicies({
      projectId,
      dryRun: true,
      now: baseNow,
    });
    expect(dryRunReport.scannedSessions).toBe(1);
    expect(dryRunReport.purgedEventsCount).toBe(1);

    // 2. Real enforcement
    const realReport = await retentionManager.enforceRetentionPolicies({
      projectId,
      dryRun: false,
      now: baseNow,
    });
    expect(realReport.purgedSessions).toBe(1);
    expect(realReport.purgedEventsCount).toBe(1);

    // Events for old session should be purged
    const events = eventStore.getEventsBySession(oldSessionId);
    expect(events.length).toBe(0);

    // Active session should be untouched
    const activeEvents = eventStore.getEventsBySession(sessionId);
    expect(activeEvents).toBeDefined();
  });

  it("exports complete immutable project audit log", async () => {
    eventStore.append({
      id: "evtOaudit_1",
      schemaVersion: 1,
      projectId,
      sessionId,
      type: "audit.recorded",
      actor: "system",
      timestamp: new Date().toISOString(),
      payload: { action: "verified" },
    });

    const exportLog = await retentionManager.exportProjectAuditLog(projectId);
    expect(exportLog.projectId).toBe(projectId);
    expect(exportLog.eventsCount).toBeGreaterThanOrEqual(1);
    expect(exportLog.data).toContain("audit.recorded");
  });
});
