import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { EventRepository } from "../../src/persistence/repositories/event-repository.js";
import { IntegrationRepository } from "../../src/persistence/repositories/integration-repository.js";
import { WebhookIngestionEngine } from "../../src/integrations/webhook-ingestion-engine.js";

describe("W-04 Webhook Persistent Deduplication Across Restarts", () => {
  let engine: SqliteEngine;
  let eventStore: EventStore;
  let integrationRepo: IntegrationRepository;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    const projectRepo = new ProjectRepository(engine);
    eventStore = new EventStore(engine, new EventRepository(engine));
    integrationRepo = new IntegrationRepository(engine);

    const now = new Date().toISOString();
    projectRepo.save({
      id: "proj_wh",
      name: "Webhook Project",
      rootPath: process.cwd(),
      status: "active",
      tags: [],
      modelProfile: "default",
      memoryNamespace: "default",
      orchestrationProfile: "default",
      trustProfile: "safe",
      createdAt: now,
      lastOpenedAt: now,
      lastActivityAt: now,
      metadata: {},
    });

    integrationRepo.save({
      id: "integ_test_01",
      projectId: "proj_wh",
      name: "GitHub Webhook",
      type: "WEBHOOK_INBOUND",
      status: "ACTIVE",
      config: {},
      createdAt: now,
      updatedAt: now,
      metadata: {},
    });
  });

  afterEach(() => {
    engine.close();
  });

  it("rejects replayed webhook after server restart / fresh ingestion engine instance", () => {
    const engine1 = new WebhookIngestionEngine({
      eventStore,
      integrationRepo,
    });

    const payload = JSON.stringify({
      deliveryId: "deliv_unique_12345",
      eventType: "push",
      timestamp: new Date().toISOString(),
      payload: { ref: "refs/heads/main" },
    });

    // First ingestion succeeds
    const res1 = engine1.ingest("integ_test_01", payload, {});
    expect(res1.accepted).toBe(true);

    // Simulate process restart: create a new WebhookIngestionEngine with empty memory set
    const engine2 = new WebhookIngestionEngine({
      eventStore,
      integrationRepo,
    });

    // Replay attack with same deliveryId must be rejected
    const res2 = engine2.ingest("integ_test_01", payload, {});
    expect(res2.accepted).toBe(false);
    expect(res2.errorMessage).toContain("Duplicate webhook rejected");
  });
});
