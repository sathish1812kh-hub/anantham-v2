import { describe, it, expect, beforeEach } from "vitest";
import { ModelRouter } from "../../src/models/model-router.js";
import { MockProviderAdapter } from "../../src/models/mock-provider-adapter.js";
import {
  GPT_4O_PROFILE,
  CLAUDE_3_5_SONNET_PROFILE,
} from "../../src/models/capability-profiles.js";

describe("ModelRouter - Failover Cascades on Transient Errors", () => {
  let router: ModelRouter;
  let claudeAdapter: MockProviderAdapter;
  let gptAdapter: MockProviderAdapter;

  beforeEach(() => {
    router = new ModelRouter();

    // Primary: Claude (Priority 20) -> Injected 429 RateLimitError
    claudeAdapter = new MockProviderAdapter({
      providerId: "anthropic",
      injectedError: "rate_limit",
      retryAfterMs: 5000,
    });

    // Fallback: GPT-4o (Priority 10) -> Healthy
    gptAdapter = new MockProviderAdapter({
      providerId: "openai",
      defaultResponseText: "Fallback to GPT-4o succeeded.",
    });

    router.registerCandidate(
      {
        modelId: "claude-3-5-sonnet",
        providerId: "anthropic",
        profile: CLAUDE_3_5_SONNET_PROFILE,
        priority: 20,
      },
      claudeAdapter
    );

    router.registerCandidate(
      {
        modelId: "gpt-4o",
        providerId: "openai",
        profile: GPT_4O_PROFILE,
        priority: 10,
      },
      gptAdapter
    );
  });

  it("cascades from failing primary to compatible fallback candidate with complete attempt audit", async () => {
    const result = await router.execute(
      {
        modelId: "claude-3-5-sonnet",
        messages: [{ role: "user", content: "Execute mission critical prompt" }],
      },
      {
        requirements: { requiredInputs: ["text", "image"] },
        maxAttempts: 2,
      }
    );

    // Assert: Succeeded with fallback candidate
    expect(result.succeededCandidate.modelId).toBe("gpt-4o");
    expect(result.response.message.content).toContain("Fallback to GPT-4o succeeded");

    // Assert: Exactly 2 attempts logged
    expect(result.attempts.length).toBe(2);

    // Attempt 1: Failed on Claude with RateLimitError
    expect(result.attempts[0].attemptNumber).toBe(1);
    expect(result.attempts[0].modelId).toBe("claude-3-5-sonnet");
    expect(result.attempts[0].status).toBe("failure");
    expect(result.attempts[0].errorName).toBe("RateLimitError");

    // Attempt 2: Succeeded on GPT-4o
    expect(result.attempts[1].attemptNumber).toBe(2);
    expect(result.attempts[1].modelId).toBe("gpt-4o");
    expect(result.attempts[1].status).toBe("success");
  });
});
