import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { WebhookSubscriptionRepository } from "../../src/persistence/repositories/webhook-subscription-repository.js";
import { WebhookDeliveryRepository } from "../../src/persistence/repositories/webhook-delivery-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { WebhookDispatcher } from "../../src/integrations/webhook-dispatcher.js";
import { EventTypes } from "../../src/domain/event.js";

describe("P8.4 Integrations — Webhook Retry Classification & Error Handling", () => {
  let engine: SqliteEngine;
  let projectRepo: ProjectRepository;
  let subRepo: WebhookSubscriptionRepository;
  let deliveryRepo: WebhookDeliveryRepository;
  let eventStore: EventStore;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    projectRepo = new ProjectRepository(engine);
    subRepo = new WebhookSubscriptionRepository(engine);
    deliveryRepo = new WebhookDeliveryRepository(engine);
    eventStore = new EventStore(engine);

    projectRepo.save({
      id: "proj_retry_test",
      name: "Retry Test Project",
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
      id: "sub_retry_01",
      projectId: "proj_retry_test",
      targetUrl: "https://flaky.endpoint.com/webhook",
      events: ["*"],
      status: "ACTIVE",
      retryPolicy: { maxAttempts: 3, initialIntervalMs: 5, maxIntervalMs: 20 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  afterEach(() => {
    engine.close();
  });

  it("retries transient 500 errors up to maxAttempts and records failure", async () => {
    let callCount = 0;
    const dispatcher = new WebhookDispatcher({
      eventStore,
      subscriptionRepo: subRepo,
      deliveryRepo,
      httpSender: async () => {
        callCount++;
        return { status: 500, ok: false, error: "Internal Server Error" };
      },
    });

    await dispatcher.handleEvent({
      id: "evt_fail_test",
      schemaVersion: 1,
      projectId: "proj_retry_test",
      type: EventTypes.TASK_CREATED,
      actor: "system",
      timestamp: new Date().toISOString(),
      payload: {},
    });

    expect(callCount).toBe(3); // 3 attempts made
    const deliveries = deliveryRepo.listBySubscription("sub_retry_01");
    expect(deliveries.length).toBe(1);
    expect(deliveries[0]!.status).toBe("FAILED");
    expect(deliveries[0]!.attempt).toBe(3);
  });

  it("does not retry permanent 404 client errors", async () => {
    let callCount = 0;
    const dispatcher = new WebhookDispatcher({
      eventStore,
      subscriptionRepo: subRepo,
      deliveryRepo,
      httpSender: async () => {
        callCount++;
        return { status: 404, ok: false, error: "Not Found" };
      },
    });

    await dispatcher.handleEvent({
      id: "evt_404_test",
      schemaVersion: 1,
      projectId: "proj_retry_test",
      type: EventTypes.TASK_CREATED,
      actor: "system",
      timestamp: new Date().toISOString(),
      payload: {},
    });

    expect(callCount).toBe(1); // Permanent failure: stops at 1 attempt
    const deliveries = deliveryRepo.listBySubscription("sub_retry_01");
    expect(deliveries[0]!.status).toBe("FAILED");
    expect(deliveries[0]!.attempt).toBe(1);
  });
});
