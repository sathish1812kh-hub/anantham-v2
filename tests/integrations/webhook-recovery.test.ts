import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { WebhookSubscriptionRepository } from "../../src/persistence/repositories/webhook-subscription-repository.js";
import { WebhookDeliveryRepository } from "../../src/persistence/repositories/webhook-delivery-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { WebhookDispatcher } from "../../src/integrations/webhook-dispatcher.js";

describe("P8.4 Integrations — Webhook Recovery & Crash Reconciliation", () => {
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
      id: "proj_recovery_test",
      name: "Recovery Test Project",
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
      id: "sub_recovery_01",
      projectId: "proj_recovery_test",
      targetUrl: "https://recover.endpoint.com/webhook",
      events: ["*"],
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  afterEach(() => {
    engine.close();
  });

  it("finds interrupted pending delivery records after a simulated crash", () => {
    // Simulate pre-crash persisted pending delivery
    deliveryRepo.save({
      id: "deliv_crashed_01",
      subscriptionId: "sub_recovery_01",
      projectId: "proj_recovery_test",
      eventId: "evt_crashed_01",
      attempt: 1,
      status: "PENDING",
      timestamp: new Date().toISOString(),
      metadata: {},
    });

    // Verify recovery scanner finds pending delivery
    const pendingDeliveries = deliveryRepo.listPending();
    expect(pendingDeliveries.length).toBe(1);
    expect(pendingDeliveries[0]!.id).toBe("deliv_crashed_01");
    expect(pendingDeliveries[0]!.status).toBe("PENDING");
  });
});
