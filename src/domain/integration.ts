import { z } from "zod";

/**
 * Integration Types.
 * PRD Part 2 Section 220.
 */
export const IntegrationTypeSchema = z.enum([
  "WEBHOOK_INBOUND",
  "WEBHOOK_OUTBOUND",
  "CICD",
  "IDE",
  "CUSTOM",
]);
export type IntegrationType = z.infer<typeof IntegrationTypeSchema>;

/**
 * Integration Status Lifecycle.
 */
export const IntegrationStatusSchema = z.enum([
  "REGISTERED",
  "ACTIVE",
  "PAUSED",
  "DISABLED",
  "ERROR",
]);
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>;

/**
 * Authoritative Integration Definition.
 */
export const IntegrationDefinitionSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().min(1).max(100),
  type: IntegrationTypeSchema,
  status: IntegrationStatusSchema.default("ACTIVE"),
  config: z.record(z.unknown()).default({}),
  secretRef: z.string().optional(), // Reference to SecretStore, never raw secret
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  metadata: z.record(z.unknown()).default({}),
});
export type IntegrationDefinition = z.infer<typeof IntegrationDefinitionSchema>;

/**
 * Inbound Webhook Payload Envelope.
 */
export const InboundWebhookPayloadSchema = z.object({
  deliveryId: z.string().min(1),
  eventType: z.string().min(1),
  timestamp: z.string().min(1),
  signature: z.string().optional(),
  payload: z.record(z.unknown()).default({}),
});
export type InboundWebhookPayload = z.infer<typeof InboundWebhookPayloadSchema>;

/**
 * Outbound Webhook Subscription.
 */
export const OutboundWebhookSubscriptionSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  targetUrl: z.string().url(),
  events: z.array(z.string()).min(1), // e.g. ["task.created", "task.completed", "*"]
  secretRef: z.string().optional(),
  status: IntegrationStatusSchema.default("ACTIVE"),
  retryPolicy: z
    .object({
      maxAttempts: z.number().int().min(1).default(3),
      initialIntervalMs: z.number().int().positive().default(1000),
      maxIntervalMs: z.number().int().positive().default(30000),
    })
    .default({ maxAttempts: 3, initialIntervalMs: 1000, maxIntervalMs: 30000 }),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type OutboundWebhookSubscription = z.infer<typeof OutboundWebhookSubscriptionSchema>;

/**
 * Webhook Delivery Record Status.
 */
export const WebhookDeliveryStatusSchema = z.enum([
  "PENDING",
  "DELIVERED",
  "FAILED",
  "DEAD_LETTER",
]);
export type WebhookDeliveryStatus = z.infer<typeof WebhookDeliveryStatusSchema>;

/**
 * Durable Webhook Delivery Record.
 */
export const WebhookDeliveryRecordSchema = z.object({
  id: z.string().min(1),
  subscriptionId: z.string().min(1),
  projectId: z.string().min(1),
  eventId: z.string().min(1),
  attempt: z.number().int().min(0).default(0),
  status: WebhookDeliveryStatusSchema.default("PENDING"),
  statusCode: z.number().int().optional(),
  error: z.string().optional(),
  timestamp: z.string().min(1),
  nextRetryAt: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type WebhookDeliveryRecord = z.infer<typeof WebhookDeliveryRecordSchema>;

/**
 * CI/CD Pipeline Trigger Payload.
 */
export const CicdTriggerPayloadSchema = z.object({
  pipelineId: z.string().min(1),
  triggerType: z.enum(["push", "pull_request", "manual", "schedule"]),
  branch: z.string().min(1),
  commitSha: z.string().min(1),
  workflowId: z.string().optional(),
  parameters: z.record(z.unknown()).default({}),
});
export type CicdTriggerPayload = z.infer<typeof CicdTriggerPayloadSchema>;

/**
 * IDE / Editor Protocol Message.
 */
export const IdeProtocolMessageSchema = z.object({
  requestId: z.string().min(1),
  method: z.enum([
    "diagnostics.get",
    "tasks.list",
    "workflows.list",
    "artifacts.get",
    "approvals.list",
    "commands.execute",
  ]),
  projectId: z.string().min(1),
  sessionId: z.string().optional(),
  params: z.record(z.unknown()).default({}),
});
export type IdeProtocolMessage = z.infer<typeof IdeProtocolMessageSchema>;
