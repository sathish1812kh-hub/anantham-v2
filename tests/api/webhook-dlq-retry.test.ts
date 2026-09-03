import { describe, it, expect } from "vitest";
import { WebhookDlqRouter } from "../../src/api/webhook-dlq-router.js";

describe("PRD-PART2-308: Dead Letter Queue (DLQ) & Webhook Retry Engine", () => {
  it("retries failed webhook dispatches and routes exhausted jobs to DLQ", async () => {
    const router = new WebhookDlqRouter(3);

    // Fails on all attempts
    const job = await router.dispatchWebhook("https://client.api/webhook", { event: "task.completed" }, async () => {
      return false; // Simulate failure
    });

    expect(job.status).toBe("dead_letter");
    expect(job.attempts).toBe(3);
    expect(router.getDlqItems().length).toBe(1);

    // Re-queue DLQ item
    const retriedJob = router.retryDlqItem(job.id);
    expect(retriedJob).toBeDefined();
    expect(retriedJob?.status).toBe("pending");
    expect(router.getDlqItems().length).toBe(0);
  });

  it("marks successful delivery on subsequent retry attempt", async () => {
    const router = new WebhookDlqRouter(3);

    // Succeeds on attempt 2
    const job = await router.dispatchWebhook("https://client.api/webhook", { event: "session.created" }, async (_url, _payload, attempt) => {
      return attempt === 2;
    });

    expect(job.status).toBe("delivered");
    expect(job.attempts).toBe(2);
    expect(router.getDlqItems().length).toBe(0);
  });
});
