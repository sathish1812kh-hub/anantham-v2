import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { IntegrationRepository } from "../../src/persistence/repositories/integration-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { WebhookIngestionEngine } from "../../src/integrations/webhook-ingestion-engine.js";

describe("P8.4 Integrations — Webhook Replay Protection & Deduplication", () => {
  let engine: SqliteEngine;
  let projectRepo: ProjectRepository;
  let integrationRepo: IntegrationRepository;
  let eventStore: EventStore;
  let ingestionEngine: WebhookIngestionEngine;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    projectRepo = new ProjectRepository(engine);
    integrationRepo = new IntegrationRepository(engine);
    eventStore = new EventStore(engine);

    projectRepo.save({
      id: "proj_replay",
      name: "Replay Test Project",
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

    integrationRepo.save({
      id: "int_replay_test",
      projectId: "proj_replay",
      name: "Replay Test Integration",
      type: "WEBHOOK_INBOUND",
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {},
    });

    ingestionEngine = new WebhookIngestionEngine({
      eventStore,
      integrationRepo,
    });
  });

  afterEach(() => {
    engine.close();
  });

  it("rejects duplicate webhook delivery with identical deliveryId", () => {
    const rawBody = JSON.stringify({
      deliveryId: "deliv_replay_001",
      eventType: "task.trigger",
      timestamp: new Date().toISOString(),
      payload: { action: "run" },
    });

    // First ingestion
    const res1 = ingestionEngine.ingest("int_replay_test", rawBody, {});
    expect(res1.accepted).toBe(true);

    // Replay attempt
    const res2 = ingestionEngine.ingest("int_replay_test", rawBody, {});
    expect(res2.accepted).toBe(false);
    expect(res2.errorMessage).toContain("Duplicate webhook rejected");
  });
});
