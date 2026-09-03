import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { ConnectorDLQRouter } from "../../src/integrations/connector-dlq-router.js";

describe("PRD-PART2-308: External Connector Network Timeout & DLQ Routing", () => {
  const testDir = join(process.cwd(), ".test_dlq_router_" + Date.now());
  const dbPath = join(testDir, "test.sqlite");
  let engine: SqliteEngine;
  let eventStore: EventStore;

  const projectId = "prj_dlq_01";
  const connectorId = "jira_webhook_01";

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
    `).run(projectId, "DLQ Project", "/tmp/dlq", "active", "[]", "default", "mem", "orch", "developer", now, now, now);

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

  it("dispatches successfully when remote endpoint returns 200 OK", async () => {
    const router = new ConnectorDLQRouter({
      engine,
      eventStore,
      httpSender: async () => ({ status: 200, ok: true }),
    });

    const result = await router.dispatch(connectorId, projectId, "https://jira.example.com/api/v2/issue", JSON.stringify({ issue: "ANAN-101" }));
    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.dlqRecord).toBeUndefined();
  });

  it("trips circuit breaker to OPEN after configured failure threshold", async () => {
    let callCount = 0;
    const router = new ConnectorDLQRouter({
      engine,
      eventStore,
      config: {
        maxRetries: 1,
        circuitBreakerThreshold: 3,
        circuitBreakerCooldownMs: 10_000,
      },
      httpSender: async () => {
        callCount++;
        return { status: 500, ok: false, error: "Internal Server Error" };
      },
    });

    // 3 failed dispatches
    await router.dispatch(connectorId, projectId, "https://api.example.com/fail", "{}");
    await router.dispatch(connectorId, projectId, "https://api.example.com/fail", "{}");
    await router.dispatch(connectorId, projectId, "https://api.example.com/fail", "{}");

    const cbState = router.getCircuitBreakerState(connectorId);
    expect(cbState.state).toBe("OPEN");
    expect(cbState.consecutiveFailures).toBe(3);

    // 4th dispatch should fast-fail and route directly to DLQ without making HTTP call
    const preCalls = callCount;
    const fastFailRes = await router.dispatch(connectorId, projectId, "https://api.example.com/fail", "{}");
    expect(fastFailRes.success).toBe(false);
    expect(callCount).toBe(preCalls); // zero additional network calls
    expect(fastFailRes.error).toBe("Circuit breaker OPEN");
  });

  it("routes poison pill 400 Bad Request directly to DLQ without wasting retries", async () => {
    let attempts = 0;
    const router = new ConnectorDLQRouter({
      engine,
      eventStore,
      config: { maxRetries: 5 },
      httpSender: async () => {
        attempts++;
        return { status: 400, ok: false, error: "Malformed payload schema" };
      },
    });

    const res = await router.dispatch(connectorId, projectId, "https://api.example.com/poison", "{}");
    expect(res.success).toBe(false);
    expect(res.statusCode).toBe(400);
    expect(attempts).toBe(1); // exactly 1 attempt, no useless retries
    expect(res.dlqRecord?.errorReason).toContain("POISON_PILL");

    const dlqItems = router.listDLQ({ connectorId });
    expect(dlqItems.length).toBe(1);
    expect(dlqItems[0].statusCode).toBe(400);
  });

  it("supports DLQ listing, replaying, and purging", async () => {
    let returnSuccess = false;
    const router = new ConnectorDLQRouter({
      engine,
      eventStore,
      config: { maxRetries: 1 },
      httpSender: async () => {
        if (returnSuccess) return { status: 200, ok: true };
        return { status: 503, ok: false, error: "Service Unavailable" };
      },
    });

    // 1. Trigger failure into DLQ
    const res = await router.dispatch(connectorId, projectId, "https://api.example.com/replay", "{}");
    expect(res.success).toBe(false);
    const dlqId = res.dlqRecord!.id;

    // 2. List DLQ
    const list = router.listDLQ();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(dlqId);

    // 3. Replay DLQ when remote endpoint recovers
    returnSuccess = true;
    const replayRes = await router.replayDLQ(dlqId);
    expect(replayRes.success).toBe(true);

    const updatedList = router.listDLQ({ status: "RESOLVED" });
    expect(updatedList.length).toBe(1);
    expect(updatedList[0].status).toBe("RESOLVED");

    // 4. Purge DLQ item
    const purged = router.purgeDLQ(dlqId);
    expect(purged).toBe(true);
    expect(router.listDLQ().length).toBe(0);
  });
});
