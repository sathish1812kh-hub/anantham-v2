/**
 * Webhook Delivery & Dead Letter Queue (DLQ) Router
 * PRD-PART2-308: Dead Letter Queue (DLQ) & Webhook Retry Engine
 */

export interface WebhookDeliveryJob {
  id: string;
  url: string;
  payload: unknown;
  attempts: number;
  maxRetries: number;
  lastError?: string;
  status: "pending" | "delivered" | "dead_letter";
  createdAt: number;
}

export class WebhookDlqRouter {
  private deadLetterQueue: WebhookDeliveryJob[] = [];
  private deliveryHistory: WebhookDeliveryJob[] = [];
  private maxRetries: number;

  constructor(maxRetries = 3) {
    this.maxRetries = maxRetries;
  }

  public async dispatchWebhook(
    url: string,
    payload: unknown,
    transportMock?: (url: string, payload: unknown, attempt: number) => Promise<boolean>
  ): Promise<WebhookDeliveryJob> {
    const job: WebhookDeliveryJob = {
      id: `wh_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      url,
      payload,
      attempts: 0,
      maxRetries: this.maxRetries,
      status: "pending",
      createdAt: Date.now(),
    };

    while (job.attempts < job.maxRetries) {
      job.attempts++;
      try {
        let success = false;
        if (transportMock) {
          success = await transportMock(job.url, job.payload, job.attempts);
        } else {
          success = true; // Simulated successful dispatch
        }

        if (success) {
          job.status = "delivered";
          this.deliveryHistory.push(job);
          return job;
        }
        job.lastError = `Delivery failed on attempt ${job.attempts}`;
      } catch (err) {
        job.lastError = err instanceof Error ? err.message : String(err);
      }
    }

    // Retries exhausted -> route to DLQ
    job.status = "dead_letter";
    this.deadLetterQueue.push(job);
    return job;
  }

  public getDlqItems(): WebhookDeliveryJob[] {
    return [...this.deadLetterQueue];
  }

  public retryDlqItem(id: string): WebhookDeliveryJob | undefined {
    const idx = this.deadLetterQueue.findIndex((j) => j.id === id);
    if (idx !== -1) {
      const job = this.deadLetterQueue.splice(idx, 1)[0]!;
      job.attempts = 0;
      job.status = "pending";
      return job;
    }
    return undefined;
  }
}
