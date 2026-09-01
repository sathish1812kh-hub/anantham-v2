import { describe, it, expect } from "vitest";
import {
  IntegrationDefinitionSchema,
  InboundWebhookPayloadSchema,
  OutboundWebhookSubscriptionSchema,
  WebhookDeliveryRecordSchema,
  CicdTriggerPayloadSchema,
  IdeProtocolMessageSchema,
} from "../../src/domain/integration.js";

describe("P8.4 Integrations — Contracts & Schema Validation", () => {
  it("validates IntegrationDefinitionSchema", () => {
    const valid = {
      id: "int_01",
      projectId: "proj_01",
      name: "GitHub Webhook",
      type: "WEBHOOK_INBOUND",
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const parsed = IntegrationDefinitionSchema.parse(valid);
    expect(parsed.name).toBe("GitHub Webhook");
    expect(parsed.status).toBe("ACTIVE");
  });

  it("validates InboundWebhookPayloadSchema", () => {
    const valid = {
      deliveryId: "deliv_123",
      eventType: "push",
      timestamp: new Date().toISOString(),
      signature: "sha256=abcdef",
      payload: { ref: "refs/heads/main" },
    };
    const parsed = InboundWebhookPayloadSchema.parse(valid);
    expect(parsed.deliveryId).toBe("deliv_123");
  });

  it("validates OutboundWebhookSubscriptionSchema", () => {
    const valid = {
      id: "sub_01",
      projectId: "proj_01",
      targetUrl: "https://api.external.com/webhooks",
      events: ["task.created", "task.completed"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const parsed = OutboundWebhookSubscriptionSchema.parse(valid);
    expect(parsed.events.length).toBe(2);
    expect(parsed.retryPolicy.maxAttempts).toBe(3);
  });

  it("validates WebhookDeliveryRecordSchema", () => {
    const valid = {
      id: "deliv_rec_01",
      subscriptionId: "sub_01",
      projectId: "proj_01",
      eventId: "evt_01",
      timestamp: new Date().toISOString(),
    };
    const parsed = WebhookDeliveryRecordSchema.parse(valid);
    expect(parsed.status).toBe("PENDING");
  });

  it("validates CicdTriggerPayloadSchema", () => {
    const valid = {
      pipelineId: "pipe_99",
      triggerType: "push",
      branch: "main",
      commitSha: "a1b2c3d4e5f6",
    };
    const parsed = CicdTriggerPayloadSchema.parse(valid);
    expect(parsed.branch).toBe("main");
  });

  it("validates IdeProtocolMessageSchema", () => {
    const valid = {
      requestId: "req_01",
      method: "diagnostics.get",
      projectId: "proj_01",
    };
    const parsed = IdeProtocolMessageSchema.parse(valid);
    expect(parsed.method).toBe("diagnostics.get");
  });
});
