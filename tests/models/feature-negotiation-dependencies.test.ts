import { describe, it, expect } from "vitest";
import { CapabilityResolver } from "../../src/models/capability-resolver.js";
import {
  CLAUDE_3_5_SONNET_PROFILE,
  TEXT_ONLY_LOCAL_PROFILE,
} from "../../src/models/capability-profiles.js";

describe("CapabilityResolver - Feature Negotiation & Dependencies", () => {
  it("resolves computerUse and promptCaching features for Claude 3.5 Sonnet", () => {
    const req = {
      requiredFeatures: [
        "computerUse" as const,
        "promptCaching" as const,
        "toolCalling" as const,
      ],
    };

    const res = CapabilityResolver.resolve(CLAUDE_3_5_SONNET_PROFILE, req);
    expect(res.compatible).toBe(true);
    expect(res.status).toBe("COMPATIBLE");
  });

  it("detects missing structuredOutput and jsonSchema features on local profile", () => {
    const req = {
      requiredFeatures: ["jsonSchema" as const, "structuredOutput" as const],
    };

    const res = CapabilityResolver.resolve(TEXT_ONLY_LOCAL_PROFILE, req);
    expect(res.compatible).toBe(false);
    expect(res.status).toBe("INCOMPATIBLE");
    expect(res.missingCapabilities).toContain("feature:jsonSchema");
    expect(res.missingCapabilities).toContain("feature:structuredOutput");
  });

  it("detects dependency conflict if parallelToolCalls requested on model without toolCalling", () => {
    const noToolsProfile = {
      ...TEXT_ONLY_LOCAL_PROFILE,
      features: {
        ...TEXT_ONLY_LOCAL_PROFILE.features,
        toolCalling: false,
      },
    };

    const req = {
      requiredFeatures: ["parallelToolCalls" as const],
    };

    const res = CapabilityResolver.resolve(noToolsProfile, req);
    expect(res.compatible).toBe(false);
    expect(res.conflicts).toContain("parallelToolCalls_requires_toolCalling");
  });
});
