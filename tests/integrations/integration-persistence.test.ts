import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { IntegrationRepository } from "../../src/persistence/repositories/integration-repository.js";
import { WebhookSubscriptionRepository } from "../../src/persistence/repositories/webhook-subscription-repository.js";
import { WebhookDeliveryRepository } from "../../src/persistence/repositories/webhook-delivery-repository.js";

describe("P8.4 Integrations — SQLite Migration 009 & Repositories", () => {
  let engine: SqliteEngine;
  let projectRepo: ProjectRepository;
  let integrationRepo: IntegrationRepository;
  let subRepo: WebhookSubscriptionRepository;
  let deliveryRepo: WebhookDeliveryRepository;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    projectRepo = new ProjectRepository(engine);
    integrationRepo = new IntegrationRepository(engine);
    subRepo = new WebhookSubscriptionRepository(engine);
    deliveryRepo = new WebhookDeliveryRepository(engine);

    projectRepo.save({
      id: "proj_int_test",
      name: "Integration Test Project",
      rootPath: "/int",
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
  });

  afterEach(() => {
    engine.close();
  });

  it("saves, lists, and deletes IntegrationDefinitions", () => {
    const now = new Date().toISOString();
    integrationRepo.save({
      id: "int_01",
      projectId: "proj_int_test",
      name: "GitHub Actions",
      type: "CICD",
      status: "ACTIVE",
      config: { autoTrigger: true },
      createdAt: now,
      updatedAt: now,
      metadata: {},
    });

    const found = integrationRepo.findById("int_01");
    expect(found).toBeDefined();
    expect(found?.name).toBe("GitHub Actions");

    const list = integrationRepo.listByProject("proj_int_test");
    expect(list.length).toBe(1);

    expect(integrationRepo.delete("int_01")).toBe(true);
    expect(integrationRepo.findById("int_01")).toBeNull();
  });

  it("saves, lists, and queries WebhookSubscriptions and Deliveries", () => {
    const now = new Date().toISOString();
    subRepo.save({
      id: "sub_01",
      projectId: "proj_int_test",
      targetUrl: "https://example.com/hook",
      events: ["task.created"],
      status: "ACTIVE",
      retryPolicy: { maxAttempts: 3, initialIntervalMs: 1000, maxIntervalMs: 30000 },
      createdAt: now,
      updatedAt: now,
    });

    const activeSubs = subRepo.listActiveByProject("proj_int_test");
    expect(activeSubs.length).toBe(1);
    expect(activeSubs[0]!.targetUrl).toBe("https://example.com/hook");

    deliveryRepo.save({
      id: "deliv_01",
      subscriptionId: "sub_01",
      projectId: "proj_int_test",
      eventId: "evt_01",
      attempt: 1,
      status: "PENDING",
      timestamp: now,
      metadata: {},
    });

    const pending = deliveryRepo.listPending();
    expect(pending.length).toBe(1);
    expect(pending[0]!.id).toBe("deliv_01");
  });
});
