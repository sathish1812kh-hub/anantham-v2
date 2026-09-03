import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { DeltaSnapshotManager } from "../../src/event-state/delta-snapshot-manager.js";
import { EventTypes } from "../../src/domain/event.js";

describe("F-REC-12: Incremental Snapshot & Point-in-Time Rollback", () => {
  const testDir = join(process.cwd(), ".test_delta_snapshot_" + Date.now());
  const dbPath = join(testDir, "test.sqlite");
  let engine: SqliteEngine;
  let eventStore: EventStore;
  let snapshotManager: DeltaSnapshotManager;
  const sessionId = "sess_snap_test_01";
  const projectId = "prj_snap_test_01";

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    engine = new SqliteEngine({ path: dbPath });
    engine.open();

    const migrationEngine = new MigrationEngine(engine);
    migrationEngine.migrate();

    // Populate base session/project
    engine.transaction(() => {
      const now = new Date().toISOString();
      engine.raw.prepare(`
        INSERT INTO projects (id, name, root_path, status, tags_json, model_profile, memory_namespace, orchestration_profile, trust_profile, created_at, last_opened_at, last_activity_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `).run(projectId, "Snapshot Project", "/tmp/snap", "active", "[]", "default", "mem", "orch", "developer", now, now, now);

      engine.raw.prepare(`
        INSERT INTO sessions (id, project_id, name, branch, status, model_profile, key_pool_profile, mode, permissions_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `).run(sessionId, projectId, "Main Session", "main", "active", "default", "default", "autonomous", "{}", now, now);
    });

    eventStore = new EventStore(engine);
    snapshotManager = new DeltaSnapshotManager({
      engine,
      eventStore,
      keyframeInterval: 5,
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

  it("creates full keyframe snapshot and incremental delta snapshots with diffs", async () => {
    // 1. Append session created and tasks
    eventStore.append({
      id: "evt_001",
      schemaVersion: 1,
      projectId,
      sessionId,
      type: EventTypes.SESSION_CREATED,
      actor: "user",
      timestamp: "2026-09-01T10:00:00.000Z",
      payload: { name: "Main Session", branch: "main" },
    });

    eventStore.append({
      id: "evt_002",
      schemaVersion: 1,
      projectId,
      sessionId,
      taskId: "task_01",
      type: EventTypes.TASK_CREATED,
      actor: "agent",
      timestamp: "2026-09-01T10:01:00.000Z",
      payload: { objective: "Implement auth" },
    });

    const keyframeSnap = await snapshotManager.captureSnapshot(sessionId, { forceKeyframe: true });
    expect(keyframeSnap.isKeyframe).toBe(true);
    expect(keyframeSnap.eventSequenceNumber).toBe(2);
    expect(keyframeSnap.taskStates["task_01"]).toBeDefined();

    // 2. Append task status updates
    eventStore.append({
      id: "evt_003",
      schemaVersion: 1,
      projectId,
      sessionId,
      taskId: "task_01",
      type: EventTypes.TASK_STARTED,
      actor: "agent",
      agentId: "agent_01",
      timestamp: "2026-09-01T10:02:00.000Z",
      payload: {},
    });

    const deltaSnap = await snapshotManager.captureSnapshot(sessionId);
    expect(deltaSnap.isKeyframe).toBe(false);
    expect(deltaSnap.baseSnapshotId).toBe(keyframeSnap.snapshotId);
    expect(deltaSnap.deltaDiff).toBeDefined();
    expect(deltaSnap.deltaDiff?.updatedTasks["task_01"]).toBeDefined();
  });

  it("reconstructs state at arbitrary historical sequence number using keyframe + delta fold", async () => {
    for (let i = 1; i <= 10; i++) {
      eventStore.append({
        id: "evt_seq_" + i,
        schemaVersion: 1,
        projectId,
        sessionId,
        taskId: "task_" + i,
        type: EventTypes.TASK_CREATED,
        actor: "agent",
        timestamp: new Date(1700000000000 + i * 1000).toISOString(),
        payload: { objective: "Objective " + i },
      });

      if (i % 3 === 0) {
        await snapshotManager.captureSnapshot(sessionId);
      }
    }

    // Reconstruct at sequence 5
    const stateAt5 = await snapshotManager.reconstructStateAt(sessionId, { sequenceNumber: 5 });
    expect(stateAt5.targetSequenceNumber).toBe(5);
    expect(Object.keys(stateAt5.taskStates).length).toBe(5);
    expect(stateAt5.taskStates["task_5"]).toBeDefined();
    expect(stateAt5.taskStates["task_6"]).toBeUndefined();
  });

  it("executes point-in-time rollback without mutating or deleting historical events", async () => {
    for (let i = 1; i <= 6; i++) {
      eventStore.append({
        id: "evt_rb_" + i,
        schemaVersion: 1,
        projectId,
        sessionId,
        taskId: "task_" + i,
        type: EventTypes.TASK_CREATED,
        actor: "agent",
        timestamp: new Date(1700000000000 + i * 1000).toISOString(),
        payload: { objective: "Task " + i },
      });
    }

    await snapshotManager.captureSnapshot(sessionId);

    // Rollback to sequence 3
    const rollbackRes = await snapshotManager.rollbackTo(sessionId, { sequenceNumber: 3 }, { reason: "Reverting tasks 4-6" });
    expect(rollbackRes.success).toBe(true);
    expect(rollbackRes.targetSequenceNumber).toBe(3);
    expect(rollbackRes.discardedEventsCount).toBe(3);
    expect(rollbackRes.compensationEventId).toBeDefined();

    // INVARIANT CHECK: Historical events 1 to 6 MUST still be present in EventStore + new rollback event
    const allEventsAfter = eventStore.getEventsBySession(sessionId);
    expect(allEventsAfter.length).toBe(7); // 6 original + 1 compensation event
    expect(allEventsAfter[allEventsAfter.length - 1].type).toBe("session.rolled_back");
  });

  it("handles dryRun rollback simulation without mutating live state or emitting events", async () => {
    eventStore.append({
      id: "evt_dry_1",
      schemaVersion: 1,
      projectId,
      sessionId,
      type: EventTypes.SESSION_CREATED,
      actor: "user",
      timestamp: "2026-09-01T10:00:00.000Z",
      payload: { name: "Dry Session" },
    });

    eventStore.append({
      id: "evt_dry_2",
      schemaVersion: 1,
      projectId,
      sessionId,
      type: EventTypes.SESSION_PAUSED,
      actor: "user",
      timestamp: "2026-09-01T10:05:00.000Z",
      payload: {},
    });

    const dryRes = await snapshotManager.rollbackTo(sessionId, { sequenceNumber: 1 }, { dryRun: true });
    expect(dryRes.success).toBe(true);
    expect(dryRes.compensationEventId).toBeUndefined();

    // No event emitted
    const events = eventStore.getEventsBySession(sessionId);
    expect(events.length).toBe(2);
  });
});
