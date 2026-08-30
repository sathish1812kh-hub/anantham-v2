import { describe, it, expect, beforeEach } from "vitest";
import { ModelRouter, NoCompatibleModelCandidateError } from "../../src/models/model-router.js";
import { MockProviderAdapter } from "../../src/models/mock-provider-adapter.js";
import {
  TEXT_ONLY_LOCAL_PROFILE,
  CLAUDE_3_5_SONNET_PROFILE,
} from "../../src/models/capability-profiles.js";

describe("ModelRouter - Structured Routing Explanations", () => {
  let router: ModelRouter;

  beforeEach(() => {
    router = new ModelRouter();

    router.registerCandidate(
      {
        modelId: "local-llama-3-8b",
        providerId: "ollama",
        profile: TEXT_ONLY_LOCAL_PROFILE,
        priority: 5,
      },
      new MockProviderAdapter({ providerId: "ollama" })
    );

    router.registerCandidate(
      {
        modelId: "claude-3-5-sonnet",
        providerId: "anthropic",
        profile: CLAUDE_3_5_SONNET_PROFILE,
        priority: 20,
      },
      new MockProviderAdapter({ providerId: "anthropic" })
    );
  });

  it("produces explainable rejected reasons for incompatible candidates", () => {
    const decision = router.route({
      requirements: {
        requiredInputs: ["text", "image"],
        requiredFeatures: ["computerUse"],
      },
    });

    expect(decision.selectedCandidate.modelId).toBe("claude-3-5-sonnet");
    expect(decision.rejectedCandidates.length).toBe(1);
    expect(decision.rejectedCandidates[0].modelId).toBe("local-llama-3-8b");
    expect(decision.rejectedCandidates[0].reason).toContain("missing");
  });

  it("throws NoCompatibleModelCandidateError with all rejection explanations if none compatible", () => {
    try {
      router.route({
        requirements: {
          requiredInputs: ["video"], // Neither Claude nor Llama supports video input
        },
      });
      expect.fail("Should have thrown NoCompatibleModelCandidateError");
    } catch (err: any) {
      expect(err).toBeInstanceOf(NoCompatibleModelCandidateError);
      expect(err.rejectedCandidates.length).toBe(2);
      expect(err.message).toContain("No compatible model candidates");
    }
  });
});
