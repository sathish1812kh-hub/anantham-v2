import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { type EventStore } from "../event-state/event-store.js";
import { type IntegrationRepository } from "../persistence/repositories/integration-repository.js";
import {
  type InboundWebhookPayload,
  InboundWebhookPayloadSchema,
} from "../domain/integration.js";
import { EventTypes, type HarnessEvent } from "../domain/event.js";

export interface WebhookIngestionOptions {
  eventStore: EventStore;
  integrationRepo: IntegrationRepository;
}

export interface IngestionResult {
  accepted: boolean;
  deliveryId: string;
  eventId?: string;
  errorMessage?: string;
}

/**
 * Inbound Webhook Ingestion Engine with HMAC Verification & Replay Protection.
 * PRD Part 2 Section 225–226.
 */
export class WebhookIngestionEngine {
  private readonly eventStore: EventStore;
  private readonly integrationRepo: IntegrationRepository;
  private readonly processedDeliveryIds = new Set<string>();

  constructor(options: WebhookIngestionOptions) {
    this.eventStore = options.eventStore;
    this.integrationRepo = options.integrationRepo;
  }

  /**
   * Cryptographically verify HMAC-SHA256 signature using timing-safe comparison.
   */
  public static verifySignature(rawBody: string, signature: string, secret: string): boolean {
    if (!signature || !secret) return false;

    const hmac = createHmac("sha256", secret);
    hmac.update(rawBody);
    const expected = hmac.digest("hex");

    const cleanSig = signature.startsWith("sha256=") ? signature.slice(7) : signature;

    if (cleanSig.length !== expected.length) {
      return false;
    }

    try {
      return timingSafeEqual(Buffer.from(cleanSig, "hex"), Buffer.from(expected, "hex"));
    } catch {
      return false;
    }
  }

  /**
   * Ingest and validate incoming webhook payload.
   */
  public ingest(
    integrationId: string,
    rawBody: string,
    headers: Record<string, string | string[] | undefined>
  ): IngestionResult {
    // 1. Resolve Integration
    const integration = this.integrationRepo.findById(integrationId);
    if (!integration) {
      return { accepted: false, deliveryId: "unknown", errorMessage: `Integration '${integrationId}' not found.` };
    }

    if (integration.status !== "ACTIVE") {
      return {
        accepted: false,
        deliveryId: "unknown",
        errorMessage: `Integration '${integrationId}' is not active (status: ${integration.status}).`,
      };
    }

    // 2. Verify Signature if Secret Reference Configured
    if (integration.secretRef) {
      const sigHeader = (headers["x-hub-signature-256"] ||
        headers["x-signature-256"] ||
        headers["x-anantham-signature"]) as string | undefined;

      if (!sigHeader) {
        return { accepted: false, deliveryId: "unknown", errorMessage: "Missing required webhook signature header." };
      }

      const isValid = WebhookIngestionEngine.verifySignature(rawBody, sigHeader, integration.secretRef);
      if (!isValid) {
        return { accepted: false, deliveryId: "unknown", errorMessage: "Invalid cryptographic webhook signature." };
      }
    }

    // 3. Parse & Validate Payload Envelope
    let jsonBody: unknown;
    try {
      jsonBody = JSON.parse(rawBody);
    } catch {
      return { accepted: false, deliveryId: "unknown", errorMessage: "Malformed JSON webhook payload." };
    }

    const parsed = InboundWebhookPayloadSchema.safeParse(jsonBody);
    if (!parsed.success) {
      return {
        accepted: false,
        deliveryId: "unknown",
        errorMessage: `Schema validation failed: ${parsed.error.message}`,
      };
    }

    const payload: InboundWebhookPayload = parsed.data;

    // 4. Replay & Duplicate Protection (In-Memory + Persistent EventStore Check)
    const replayKey = `${integrationId}:${payload.deliveryId}`;
    if (this.processedDeliveryIds.has(replayKey)) {
      return {
        accepted: false,
        deliveryId: payload.deliveryId,
        errorMessage: `Duplicate webhook rejected: deliveryId '${payload.deliveryId}' already processed.`,
      };
    }

    // Check persistent EventStore to defend against post-restart replay attacks
    const existingEvents = this.eventStore.getEventsByProject(integration.projectId, {
      type: EventTypes.INTEGRATION_WEBHOOK_RECEIVED,
    });
    const isPersistentDuplicate = existingEvents.some(
      (e) => (e.payload as any)?.integrationId === integrationId && (e.payload as any)?.deliveryId === payload.deliveryId
    );

    if (isPersistentDuplicate) {
      this.processedDeliveryIds.add(replayKey);
      return {
        accepted: false,
        deliveryId: payload.deliveryId,
        errorMessage: `Duplicate webhook rejected: deliveryId '${payload.deliveryId}' already processed.`,
      };
    }

    // Bound memory cache to prevent unbounded growth
    if (this.processedDeliveryIds.size >= 10000) {
      const firstKey = this.processedDeliveryIds.values().next().value;
      if (firstKey) this.processedDeliveryIds.delete(firstKey);
    }
    this.processedDeliveryIds.add(replayKey);

    // 5. Commit Untrusted Webhook Event to Authoritative EventStore
    const eventId = `evt_webhook_${randomUUID().slice(0, 8)}`;
    const event: HarnessEvent = {
      id: eventId,
      schemaVersion: 1,
      projectId: integration.projectId,
      type: EventTypes.INTEGRATION_WEBHOOK_RECEIVED,
      actor: "system",
      timestamp: new Date().toISOString(),
      payload: {
        integrationId: integration.id,
        deliveryId: payload.deliveryId,
        eventType: payload.eventType,
        originalTimestamp: payload.timestamp,
        data: payload.payload,
      },
    };

    this.eventStore.append(event);

    return {
      accepted: true,
      deliveryId: payload.deliveryId,
      eventId,
    };
  }
}
