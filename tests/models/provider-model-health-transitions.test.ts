import { describe, it, expect, beforeEach } from "vitest";
import { ProviderHealthTracker } from "../../src/models/provider-health-tracker.js";
import { ProviderUnavailableError, RateLimitError } from "../../src/models/model-errors.js";

describe("ProviderHealthTracker - Independent Health State Transitions", () => {
  let tracker: ProviderHealthTracker;

  beforeEach(() => {
    tracker = new ProviderHealthTracker();
  });

  it("transitions provider and model health independently", () => {
    // 1. Initial status is healthy
    expect(tracker.getProviderHealth("openai").status).toBe("healthy");
    expect(tracker.getModelHealth("openai", "gpt-4o").status).toBe("healthy");

    // 2. Minor error on gpt-4o increases failure count
    tracker.recordFailure("openai", "gpt-4o", new RateLimitError("Rate limit exceeded"));
    expect(tracker.getModelHealth("openai", "gpt-4o").consecutiveFailures).toBe(1);
    expect(tracker.getModelHealth("openai", "gpt-4o").status).toBe("healthy");

    // Sibling model gpt-4o-mini is unaffected
    expect(tracker.getModelHealth("openai", "gpt-4o-mini").consecutiveFailures).toBe(0);

    // 3. Provider outage marks provider unavailable immediately
    tracker.recordFailure("openai", undefined, new ProviderUnavailableError("503 Service Unavailable"));
    expect(tracker.getProviderHealth("openai").status).toBe("degraded");

    tracker.recordFailure("openai", undefined, new ProviderUnavailableError("503 Service Unavailable"), 1);
    expect(tracker.getProviderHealth("openai").status).toBe("unavailable");

    // 4. Success restores healthy status
    tracker.recordSuccess("openai", "gpt-4o");
    expect(tracker.getProviderHealth("openai").status).toBe("healthy");
    expect(tracker.getModelHealth("openai", "gpt-4o").status).toBe("healthy");
  });
});
