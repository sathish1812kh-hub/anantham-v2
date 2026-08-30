import { describe, it, expect, beforeEach } from "vitest";
import { ModelRouter } from "../../src/models/model-router.js";
import { KeyPoolManager } from "../../src/models/key-pool-manager.js";
import { ProviderHealthTracker } from "../../src/models/provider-health-tracker.js";
import { MockProviderAdapter } from "../../src/models/mock-provider-adapter.js";
import {
  GPT_4O_PROFILE,
  CLAUDE_3_5_SONNET_PROFILE,
} from "../../src/models/capability-profiles.js";

describe("ModelRouter - KeyPool & Health Integration", () => {
  let router: ModelRouter;
  let poolManager: KeyPoolManager;
  let healthTracker: ProviderHealthTracker;

  beforeEach(async () => {
    poolManager = new KeyPoolManager();
    healthTracker = new ProviderHealthTracker();

    router = new ModelRouter({
      keyPoolManager: poolManager,
      healthTracker,
    });

    // Primary: Anthropic (Priority 20) -> But 0 keys configured
    router.registerCandidate(
      {
        modelId: "claude-3-5-sonnet",
        providerId: "anthropic",
        profile: CLAUDE_3_5_SONNET_PROFILE,
        priority: 20,
      },
      new MockProviderAdapter({ providerId: "anthropic" })
    );

    // Fallback: OpenAI (Priority 10) -> Healthy key configured
    await poolManager.addCredential(
      {
        credentialId: "cred_openai_active",
        providerId: "openai",
        authProfileId: "prof_openai",
        name: "OpenAI Prod Key",
        maskedFingerprint: "sk-...9999",
        maxConcurrent: 2,
        status: "available",
        createdAt: new Date().toISOString(),
      },
      "sk-openai-secret"
    );

    router.registerCandidate(
      {
        modelId: "gpt-4o",
        providerId: "openai",
        profile: GPT_4O_PROFILE,
        priority: 10,
      },
      new MockProviderAdapter({
        providerId: "openai",
        defaultResponseText: "Executed via KeyPool managed lease.",
      })
    );
  });

  it("cascades from key-exhausted candidate to key-available fallback candidate", async () => {
    const result = await router.execute(
      {
        modelId: "claude-3-5-sonnet",
        messages: [{ role: "user", content: "Process prompt with key management" }],
      },
      {
        requirements: { requiredInputs: ["text", "image"] },
        maxAttempts: 2,
      }
    );

    // Assert: Succeeded with GPT-4o
    expect(result.succeededCandidate.modelId).toBe("gpt-4o");
    expect(result.response.message.content).toContain("Executed via KeyPool managed lease");

    // Assert: Attempt 1 logged KeyPoolExhaustedError
    expect(result.attempts.length).toBe(2);
    expect(result.attempts[0].errorName).toBe("KeyPoolExhaustedError");
    expect(result.attempts[1].status).toBe("success");

    // Assert: Key lease was cleanly released (concurrencyCount back to 0)
    const cred = poolManager.getCredential("cred_openai_active");
    expect(cred?.concurrencyCount).toBe(0);
  });
});
