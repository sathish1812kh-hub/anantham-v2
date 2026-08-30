import { describe, it, expect } from "vitest";
import { CapabilityResolver } from "../../src/models/capability-resolver.js";
import { GPT_4O_PROFILE } from "../../src/models/capability-profiles.js";

describe("CapabilityResolver - Profile Lifecycle & Staleness", () => {
  it("resolves UNKNOWN when profile status is 'unknown'", () => {
    const unknownProfile = {
      ...GPT_4O_PROFILE,
      status: "unknown" as const,
    };

    const res = CapabilityResolver.resolve(unknownProfile, {
      requiredInputs: ["text"],
    });

    expect(res.compatible).toBe(false);
    expect(res.status).toBe("UNKNOWN");
    expect(res.explanation).toContain("unknown or unavailable");
  });

  it("resolves INCOMPATIBLE when profile status is 'invalid'", () => {
    const invalidProfile = {
      ...GPT_4O_PROFILE,
      status: "invalid" as const,
    };

    const res = CapabilityResolver.resolve(invalidProfile, {
      requiredInputs: ["text"],
    });

    expect(res.compatible).toBe(false);
    expect(res.status).toBe("INCOMPATIBLE");
    expect(res.explanation).toContain("marked invalid");
  });

  it("flags conflict when strictStaleness is true on stale profile", () => {
    const staleProfile = {
      ...GPT_4O_PROFILE,
      status: "stale" as const,
    };

    const resStrict = CapabilityResolver.resolve(
      staleProfile,
      { requiredInputs: ["text"] },
      { strictStaleness: true }
    );
    expect(resStrict.compatible).toBe(false);
    expect(resStrict.conflicts).toContain("profile_stale");

    const resNormal = CapabilityResolver.resolve(staleProfile, {
      requiredInputs: ["text"],
    });
    expect(resNormal.compatible).toBe(true);
  });
});
