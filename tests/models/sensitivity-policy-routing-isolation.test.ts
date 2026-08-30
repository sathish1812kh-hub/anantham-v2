import { describe, it, expect, beforeEach } from "vitest";
import { ModelRouter } from "../../src/models/model-router.js";
import { MockProviderAdapter } from "../../src/models/mock-provider-adapter.js";
import {
  GPT_4O_PROFILE,
  TEXT_ONLY_LOCAL_PROFILE,
} from "../../src/models/capability-profiles.js";

describe("ModelRouter - Sensitivity & Policy Authorization", () => {
  let router: ModelRouter;

  beforeEach(() => {
    router = new ModelRouter();

    // 1. External Cloud Model (maxSensitivity: normal)
    router.registerCandidate(
      {
        modelId: "gpt-4o",
        providerId: "openai",
        profile: GPT_4O_PROFILE,
        priority: 20, // Higher priority
        maxSensitivity: "normal",
      },
      new MockProviderAdapter({ providerId: "openai" })
    );

    // 2. On-Premises Local Model (maxSensitivity: secret)
    router.registerCandidate(
      {
        modelId: "local-llama-3-8b",
        providerId: "ollama",
        profile: TEXT_ONLY_LOCAL_PROFILE,
        priority: 5,
        maxSensitivity: "secret",
      },
      new MockProviderAdapter({ providerId: "ollama" })
    );
  });

  it("excludes cloud models with lower sensitivity thresholds when routing 'secret' requests", () => {
    const decision = router.route({
      requirements: { requiredInputs: ["text"] },
      sensitivity: "secret",
    });

    // GPT-4o (maxSensitivity: normal) is rejected; Local Llama (maxSensitivity: secret) is selected
    expect(decision.selectedCandidate.modelId).toBe("local-llama-3-8b");
    expect(decision.rejectedCandidates.length).toBe(1);
    expect(decision.rejectedCandidates[0].modelId).toBe("gpt-4o");
    expect(decision.rejectedCandidates[0].reason).toContain("Sensitivity level 'secret' exceeds");
  });
});
