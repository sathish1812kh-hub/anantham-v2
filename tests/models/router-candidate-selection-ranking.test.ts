import { describe, it, expect, beforeEach } from "vitest";
import { ModelRouter } from "../../src/models/model-router.js";
import { MockProviderAdapter } from "../../src/models/mock-provider-adapter.js";
import {
  GPT_4O_PROFILE,
  CLAUDE_3_5_SONNET_PROFILE,
  TEXT_ONLY_LOCAL_PROFILE,
} from "../../src/models/capability-profiles.js";

describe("ModelRouter - Candidate Selection & Deterministic Ranking", () => {
  let router: ModelRouter;

  beforeEach(() => {
    router = new ModelRouter();

    // Register 3 candidates
    router.registerCandidate(
      {
        modelId: "gpt-4o",
        providerId: "openai",
        profile: GPT_4O_PROFILE,
        priority: 10,
      },
      new MockProviderAdapter({ providerId: "openai" })
    );

    router.registerCandidate(
      {
        modelId: "claude-3-5-sonnet",
        providerId: "anthropic",
        profile: CLAUDE_3_5_SONNET_PROFILE,
        priority: 20, // Higher priority
      },
      new MockProviderAdapter({ providerId: "anthropic" })
    );

    router.registerCandidate(
      {
        modelId: "local-llama-3-8b",
        providerId: "ollama",
        profile: TEXT_ONLY_LOCAL_PROFILE,
        priority: 5,
      },
      new MockProviderAdapter({ providerId: "ollama" })
    );
  });

  it("selects highest priority compatible candidate when no preference given", () => {
    const decision = router.route({
      requirements: { requiredInputs: ["text", "image"] },
    });

    // Claude (priority 20) > GPT-4o (priority 10); Local excluded due to missing imageInput
    expect(decision.selectedCandidate.modelId).toBe("claude-3-5-sonnet");
    expect(decision.rankedCandidates.length).toBe(2);
    expect(decision.rejectedCandidates.length).toBe(1);
    expect(decision.rejectedCandidates[0].modelId).toBe("local-llama-3-8b");
  });

  it("honors explicit preferredModelId over higher priority candidates", () => {
    const decision = router.route({
      requirements: { requiredInputs: ["text", "image"] },
      preferredModelId: "gpt-4o",
    });

    expect(decision.selectedCandidate.modelId).toBe("gpt-4o");
    expect(decision.rankedCandidates[0].modelId).toBe("gpt-4o");
    expect(decision.rankedCandidates[1].modelId).toBe("claude-3-5-sonnet");
  });
});
