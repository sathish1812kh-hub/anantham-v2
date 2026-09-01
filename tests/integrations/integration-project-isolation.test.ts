import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { IntegrationRepository } from "../../src/persistence/repositories/integration-repository.js";
import { WebhookSubscriptionRepository } from "../../src/persistence/repositories/webhook-subscription-repository.js";
import { WebhookDeliveryRepository } from "../../src/persistence/repositories/webhook-delivery-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { WebhookDispatcher } from "../../src/integrations/webhook-dispatcher.js";
import { EventTypes } from "../../src/domain/event.js";

describe("P8.4 Integrations — Project Tenant Isolation Boundary", () => {
  let engine: SqliteEngine;
  let projectRepo: ProjectRepository;
  let subRepo: WebhookSubscriptionRepository;
  let deliveryRepo: WebhookDeliveryRepository;
  let eventStore: EventStore;
  let dispatcher: WebhookDispatcher;

  let deliveredUrls: string[] = [];

  beforeEach(() => {
    deliveredUrls = [];
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    projectRepo = new ProjectRepository(engine);
    subRepo = new WebhookSubscriptionRepository(engine);
    deliveryRepo = new WebhookDeliveryRepository(engine);
    eventStore = new EventStore(engine);

    projectRepo.save({
      id: "proj_tenant_a",
      name: "Tenant A",
      rootPath: "/a",
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

    projectRepo.save({
      id: "proj_tenant_b",
      name: "Tenant B",
      rootPath: "/b",
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
      id: "sub_tenant_a",
      projectId: "proj_tenant_a",
      targetUrl: "https://tenant-a.com/events",
      events: ["*"],
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    subRepo.save({
      id: "sub_tenant_b",
      projectId: "proj_tenant_b",
      targetUrl: "https://tenant-b.com/events",
      events: ["*"],
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    dispatcher = new WebhookDispatcher({
      eventStore,
      subscriptionRepo: subRepo,
      deliveryRepo,
      httpSender: async (url) => {
        deliveredUrls.push(url);
        return { status: 200, ok: true };
      },
    });
  });

  afterEach(() => {
    engine.close();
  });

  it("ensures events from Project A are NEVER dispatched to Project B webhook endpoints", async () => {
    await dispatcher.handleEvent({
      id: "evt_tenant_a_01",
      schemaVersion: 1,
      projectId: "proj_tenant_a",
      type: EventTypes.TASK_CREATED,
      actor: "agent",
      timestamp: new Date().toISOString(),
      payload: { data: "secret_tenant_a" },
    });

    expect(deliveredUrls).toEqual(["https://tenant-a.com/events"]);
    expect(deliveredUrls).not.toContain("https://tenant-b.com/events");
  });
});
