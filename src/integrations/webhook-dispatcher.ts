import { createHmac, randomUUID } from "node:crypto";
import { type EventStore } from "../event-state/event-store.js";
import { type WebhookSubscriptionRepository } from "../persistence/repositories/webhook-subscription-repository.js";
import { type WebhookDeliveryRepository } from "../persistence/repositories/webhook-delivery-repository.js";
import {
  type OutboundWebhookSubscription,
  type WebhookDeliveryRecord,
} from "../domain/integration.js";
import { EventTypes, type HarnessEvent } from "../domain/event.js";

export type HttpSender = (
  url: string,
  body: string,
  headers: Record<string, string>
) => Promise<{ status: number; ok: boolean; error?: string }>;

export interface WebhookDispatcherOptions {
  eventStore: EventStore;
  subscriptionRepo: WebhookSubscriptionRepository;
  deliveryRepo: WebhookDeliveryRepository;
  httpSender?: HttpSender;
}

/**
 * Outbound Webhook Dispatcher & Reliable Delivery Engine.
 * PRD Part 2 Section 230–235.
 */
export class WebhookDispatcher {
  private readonly eventStore: EventStore;
  private readonly subscriptionRepo: WebhookSubscriptionRepository;
  private readonly deliveryRepo: WebhookDeliveryRepository;
  private readonly httpSender: HttpSender;
  private unsubscribe?: () => void;

  constructor(options: WebhookDispatcherOptions) {
    this.eventStore = options.eventStore;
    this.subscriptionRepo = options.subscriptionRepo;
    this.deliveryRepo = options.deliveryRepo;

    this.httpSender =
      options.httpSender ??
      (async (url, body, headers) => {
        try {
          const res = await fetch(url, { method: "POST", body, headers });
          return { status: res.status, ok: res.ok };
        } catch (err: any) {
          return { status: 500, ok: false, error: err.message };
        }
      });
  }

  public start(): void {
    if (this.unsubscribe) return;

    this.unsubscribe = this.eventStore.subscribe({}, (event) => {
      this.handleEvent(event).catch(() => {
        // Non-blocking on subscriber dispatch
      });
    });
  }

  public stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
  }

  /**
   * Process an authoritative event and dispatch to matching subscriptions.
   */
  public async handleEvent(event: Readonly<HarnessEvent>): Promise<WebhookDeliveryRecord[]> {
    if (!event.projectId) return [];
    if (
      event.type === EventTypes.INTEGRATION_WEBHOOK_DELIVERED ||
      event.type === EventTypes.INTEGRATION_WEBHOOK_FAILED
    ) {
      return []; // Prevent recursive delivery cascades
    }

    const subscriptions = this.subscriptionRepo.listActiveByProject(event.projectId);
    const deliveries: WebhookDeliveryRecord[] = [];

    for (const sub of subscriptions) {
      if (this.matchesEvent(sub, event.type)) {
        const delivery = await this.dispatchToSubscription(sub, event);
        deliveries.push(delivery);
      }
    }

    return deliveries;
  }

  private matchesEvent(sub: OutboundWebhookSubscription, eventType: string): boolean {
    return sub.events.includes("*") || sub.events.includes(eventType);
  }

  private async dispatchToSubscription(
    sub: OutboundWebhookSubscription,
    event: Readonly<HarnessEvent>
  ): Promise<WebhookDeliveryRecord> {
    const deliveryId = `deliv_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    // 1. Durably record pending delivery attempt
    const record: WebhookDeliveryRecord = {
      id: deliveryId,
      subscriptionId: sub.id,
      projectId: sub.projectId,
      eventId: event.id,
      attempt: 1,
      status: "PENDING",
      timestamp: now,
      metadata: {},
    };
    this.deliveryRepo.save(record);

    // 2. Prepare payload & cryptographic signature
    const payloadStr = JSON.stringify({
      deliveryId,
      subscriptionId: sub.id,
      event,
      timestamp: now,
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Anantham-Delivery-Id": deliveryId,
      "X-Anantham-Event": event.type,
    };

    if (sub.secretRef) {
      const hmac = createHmac("sha256", sub.secretRef);
      hmac.update(payloadStr);
      headers["X-Anantham-Signature"] = `sha256=${hmac.digest("hex")}`;
    }

    // 3. Execute HTTP Dispatch with retry
    let maxAttempts = sub.retryPolicy.maxAttempts;
    let attempt = 0;
    let success = false;
    let lastError: string | undefined;
    let lastStatusCode = 0;

    while (attempt < maxAttempts && !success) {
      attempt++;
      const res = await this.httpSender(sub.targetUrl, payloadStr, headers);
      lastStatusCode = res.status;

      if (res.ok) {
        success = true;
        break;
      } else {
        lastError = res.error ?? `HTTP ${res.status}`;
        // Permanent failure check: 4xx except 429
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          break; // Do not retry permanent client error
        }
      }
    }

    // 4. Update durable delivery record
    record.attempt = attempt;
    record.status = success ? "DELIVERED" : "FAILED";
    record.statusCode = lastStatusCode;
    record.error = success ? undefined : lastError;
    this.deliveryRepo.save(record);

    // 5. Emit delivery outcome event to EventStore
    try {
      this.eventStore.append({
        id: `evt_${deliveryId}_result`,
        schemaVersion: 1,
        projectId: sub.projectId,
        type: success
          ? EventTypes.INTEGRATION_WEBHOOK_DELIVERED
          : EventTypes.INTEGRATION_WEBHOOK_FAILED,
        actor: "system",
        timestamp: new Date().toISOString(),
        payload: {
          deliveryId,
          subscriptionId: sub.id,
          targetUrl: sub.targetUrl,
          statusCode: lastStatusCode,
          attempt,
          success,
          error: lastError,
        },
      });
    } catch {
      // Non-blocking
    }

    return record;
  }
}
