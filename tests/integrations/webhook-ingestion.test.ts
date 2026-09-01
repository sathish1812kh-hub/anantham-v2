import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { IntegrationRepository } from "../../src/persistence/repositories/integration-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { WebhookIngestionEngine } from "../../src/integrations/webhook-ingestion-engine.js";
import { EventTypes } from "../../src/domain/event.js";

describe("P8.4 Integrations — Webhook Ingestion & HMAC Verification", () => {
  let engine: SqliteEngine;
  let projectRepo: ProjectRepository;
  let integrationRepo: IntegrationRepository;
  let eventStore: EventStore;
  let ingestionEngine: WebhookIngestionEngine;

  const secretKey = "webhook_secret_key_12345";

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    projectRepo = new ProjectRepository(engine);
    integrationRepo = new IntegrationRepository(engine);
    eventStore = new EventStore(engine);

    projectRepo.save({
      id: "proj_webhook_in",
      name: "Webhook Inbound App",
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
      id: "int_github_in",
      projectId: "proj_webhook_in",
      name: "GitHub Inbound Webhook",
      type: "WEBHOOK_INBOUND",
      status: "ACTIVE",
      secretRef: secretKey,
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

  it("accepts valid HMAC signed inbound webhook and commits event to EventStore", () => {
    const rawBody = JSON.stringify({
      deliveryId: "deliv_gh_001",
      eventType: "issues.opened",
      timestamp: new Date().toISOString(),
      payload: { issueNumber: 42, title: "Bug in CLI" },
    });

    const hmac = createHmac("sha256", secretKey);
    hmac.update(rawBody);
    const signature = `sha256=${hmac.digest("hex")}`;

    const res = ingestionEngine.ingest("int_github_in", rawBody, {
      "x-hub-signature-256": signature,
    });

    expect(res.accepted).toBe(true);
    expect(res.eventId).toBeDefined();

    // Verify event in EventStore
    const events = eventStore.getEventsByProject("proj_webhook_in");
    expect(events.length).toBe(1);
    expect(events[0]!.type).toBe(EventTypes.INTEGRATION_WEBHOOK_RECEIVED);
    expect(events[0]!.payload.deliveryId).toBe("deliv_gh_001");
  });

  it("rejects webhook with invalid signature", () => {
    const rawBody = JSON.stringify({
      deliveryId: "deliv_tampered_001",
      eventType: "push",
      timestamp: new Date().toISOString(),
      payload: {},
    });

    const res = ingestionEngine.ingest("int_github_in", rawBody, {
      "x-hub-signature-256": "sha256=invalid_signature_hex_0000000000000000000000000000000000000000",
    });

    expect(res.accepted).toBe(false);
    expect(res.errorMessage).toContain("Invalid cryptographic webhook signature");
  });
});
