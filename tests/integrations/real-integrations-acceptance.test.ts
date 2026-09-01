import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { ArtifactRepository } from "../../src/persistence/repositories/artifact-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { IntegrationManager } from "../../src/integrations/integration-manager.js";
import { EventTypes } from "../../src/domain/event.js";

describe("P8.4 Integrations — Real End-to-End Integration Acceptance Scenario", () => {
  let engine: SqliteEngine;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let taskRepo: TaskRepository;
  let artifactRepo: ArtifactRepository;
  let eventStore: EventStore;
  let manager: IntegrationManager;

  const webhookSecret = "acceptance_secret_key_8899";
  let outboundDeliveries: Array<{ url: string; headers: Record<string, string>; body: string }> = [];

  beforeEach(() => {
    outboundDeliveries = [];
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    projectRepo = new ProjectRepository(engine);
    sessionRepo = new SessionRepository(engine);
    taskRepo = new TaskRepository(engine);
    artifactRepo = new ArtifactRepository(engine);
    eventStore = new EventStore(engine);

    // Setup Project
    projectRepo.save({
      id: "proj_acceptance_int",
      name: "Acceptance Integration Project",
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

    manager = new IntegrationManager({
      engine,
      eventStore,
      projectRepo,
      sessionRepo,
      taskRepo,
      artifactRepo,
      httpSender: async (url, body, headers) => {
        outboundDeliveries.push({ url, body, headers });
        return { status: 200, ok: true };
      },
    });

    // 1. Register Inbound Webhook Integration
    manager.integrationRepo.save({
      id: "int_inbound_ci",
      projectId: "proj_acceptance_int",
      name: "GitHub Webhook Inbound",
      type: "WEBHOOK_INBOUND",
      status: "ACTIVE",
      secretRef: webhookSecret,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {},
    });

    // 2. Register Outbound Webhook Subscription
    manager.subscriptionRepo.save({
      id: "sub_slack_alerts",
      projectId: "proj_acceptance_int",
      targetUrl: "https://alerts.enterprise.com/hooks/anantham",
      events: ["task.completed"],
      secretRef: "outbound_signing_secret",
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    manager.start();
  });

  afterEach(() => {
    manager.stop();
    engine.close();
  });

  it("executes full inbound webhook -> task creation -> execution -> outbound webhook notification flow", async () => {
    // Step 1: Inbound Webhook arrives from GitHub
    const inboundPayload = JSON.stringify({
      deliveryId: "deliv_github_push_999",
      eventType: "push",
      timestamp: new Date().toISOString(),
      payload: {
        pipelineId: "pipe_77",
        triggerType: "push",
        branch: "main",
        commitSha: "f00ba2123456",
      },
    });

    const hmac = createHmac("sha256", webhookSecret);
    hmac.update(inboundPayload);
    const signature = `sha256=${hmac.digest("hex")}`;

    const ingestRes = manager.ingestionEngine.ingest("int_inbound_ci", inboundPayload, {
      "x-hub-signature-256": signature,
    });
    expect(ingestRes.accepted).toBe(true);

    // Step 2: CI/CD adapter triggers task creation
    const ciTask = manager.cicdAdapter.triggerCiTask("proj_acceptance_int", {
      pipelineId: "pipe_77",
      triggerType: "push",
      branch: "main",
      commitSha: "f00ba2123456",
    });
    expect(ciTask.id).toBeDefined();

    // Step 3: Runtime completes the task and emits TASK_COMPLETED event
    eventStore.append({
      id: `evt_task_completed_${ciTask.id}`,
      schemaVersion: 1,
      projectId: "proj_acceptance_int",
      sessionId: ciTask.sessionId,
      taskId: ciTask.id,
      type: EventTypes.TASK_COMPLETED,
      actor: "agent",
      timestamp: new Date().toISOString(),
      payload: { result: "CI build succeeded" },
    });

    // Step 4: Allow outbound dispatcher to deliver notification
    await new Promise((r) => setTimeout(r, 60));

    expect(outboundDeliveries.length).toBe(1);
    expect(outboundDeliveries[0]!.url).toBe("https://alerts.enterprise.com/hooks/anantham");
    expect(outboundDeliveries[0]!.headers["X-Anantham-Signature"]).toMatch(/^sha256=/);

    // Step 5: Verify durable delivery record
    const deliveries = manager.deliveryRepo.listBySubscription("sub_slack_alerts");
    expect(deliveries.length).toBe(1);
    expect(deliveries[0]!.status).toBe("DELIVERED");
  });
});
