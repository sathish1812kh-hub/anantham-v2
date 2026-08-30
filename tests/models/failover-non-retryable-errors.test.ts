import { describe, it, expect, beforeEach } from "vitest";
import { ModelRouter } from "../../src/models/model-router.js";
import { MockProviderAdapter } from "../../src/models/mock-provider-adapter.js";
import {
  GPT_4O_PROFILE,
  CLAUDE_3_5_SONNET_PROFILE,
} from "../../src/models/capability-profiles.js";
import { ContentFilterError } from "../../src/models/model-errors.js";

describe("ModelRouter - Non-Retryable Error Safety", () => {
  let router: ModelRouter;

  beforeEach(() => {
    router = new ModelRouter();

    // Primary: Custom error thrower for ContentFilterError
    const contentFilterAdapter = new MockProviderAdapter({ providerId: "anthropic" });
    contentFilterAdapter.send = async () => {
      throw new ContentFilterError("Safety policy violation flagged by provider.");
    };

    const gptAdapter = new MockProviderAdapter({
      providerId: "openai",
      defaultResponseText: "Should not be called.",
    });

    router.registerCandidate(
      {
        modelId: "claude-3-5-sonnet",
        providerId: "anthropic",
        profile: CLAUDE_3_5_SONNET_PROFILE,
        priority: 20,
      },
      contentFilterAdapter
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

  it("aborts failover immediately on ContentFilterError without replaying prompt to fallback model", async () => {
    await expect(
      router.execute(
        {
          modelId: "claude-3-5-sonnet",
          messages: [{ role: "user", content: "Unsafe prompt" }],
        },
        {
          requirements: { requiredInputs: ["text"] },
          maxAttempts: 2,
        }
      )
    ).rejects.toThrow(ContentFilterError);
  });
});
