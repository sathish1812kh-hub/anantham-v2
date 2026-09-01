import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { WebhookSubscriptionRepository } from "../../src/persistence/repositories/webhook-subscription-repository.js";
import { WebhookDeliveryRepository } from "../../src/persistence/repositories/webhook-delivery-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { WebhookDispatcher } from "../../src/integrations/webhook-dispatcher.js";
import { EventTypes } from "../../src/domain/event.js";

describe("P8.4 Integrations — Outbound Webhook Dispatcher", () => {
  let engine: SqliteEngine;
  let projectRepo: ProjectRepository;
  let subRepo: WebhookSubscriptionRepository;
  let deliveryRepo: WebhookDeliveryRepository;
  let eventStore: EventStore;
  let dispatcher: WebhookDispatcher;

  let dispatchedRequests: Array<{ url: string; body: string; headers: Record<string, string> }> = [];

  beforeEach(() => {
    dispatchedRequests = [];
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    projectRepo = new ProjectRepository(engine);
    subRepo = new WebhookSubscriptionRepository(engine);
    deliveryRepo = new WebhookDeliveryRepository(engine);
    eventStore = new EventStore(engine);

    projectRepo.save({
      id: "proj_out_test",
      name: "Outbound Webhook App",
      rootPath: "/app",
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

    subRepo.save({
      id: "sub_slack_01",
      projectId: "proj_out_test",
      targetUrl: "https://hooks.slack.com/services/test",
      events: ["task.completed"],
      secretRef: "secret_outbound_123",
      status: "ACTIVE",
      retryPolicy: { maxAttempts: 2, initialIntervalMs: 10, maxIntervalMs: 50 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    dispatcher = new WebhookDispatcher({
      eventStore,
      subscriptionRepo: subRepo,
      deliveryRepo,
      httpSender: async (url, body, headers) => {
        dispatchedRequests.push({ url, body, headers });
        return { status: 200, ok: true };
      },
    });

    dispatcher.start();
  });

  afterEach(() => {
    dispatcher.stop();
    engine.close();
  });

  it("dispatches signed outbound webhook on matching EventStore event", async () => {
    eventStore.append({
      id: "evt_task_done_01",
      schemaVersion: 1,
      projectId: "proj_out_test",
      type: EventTypes.TASK_COMPLETED,
      actor: "agent",
      timestamp: new Date().toISOString(),
      payload: { taskId: "task_01", status: "completed" },
    });

    // Allow event notification dispatch
    await new Promise((r) => setTimeout(r, 50));

    expect(dispatchedRequests.length).toBe(1);
    expect(dispatchedRequests[0]!.url).toBe("https://hooks.slack.com/services/test");
    expect(dispatchedRequests[0]!.headers["X-Anantham-Signature"]).toMatch(/^sha256=/);

    const deliveries = deliveryRepo.listBySubscription("sub_slack_01");
    expect(deliveries.length).toBe(1);
    expect(deliveries[0]!.status).toBe("DELIVERED");
  });
});
