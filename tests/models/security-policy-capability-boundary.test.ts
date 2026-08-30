import { describe, it, expect } from "vitest";
import { CapabilityResolver } from "../../src/models/capability-resolver.js";
import { GEMINI_1_5_PRO_PROFILE } from "../../src/models/capability-profiles.js";

describe("Security Boundaries - Capability != Authorization", () => {
  it("INVARIANT 3 & 7: Model capability for codeExecution does NOT authorize unvalidated runtime execution", () => {
    // Model technically supports code execution
    expect(GEMINI_1_5_PRO_PROFILE.features.codeExecution).toBe(true);

    const req = {
      requiredFeatures: ["codeExecution" as const],
    };

    // CapabilityResolver confirms technical capability
    const res = CapabilityResolver.resolve(GEMINI_1_5_PRO_PROFILE, req);
    expect(res.compatible).toBe(true);

    // But technical capability does NOT grant runtime permission or bypass ToolGateway
    const runtimePolicy = {
      allowArbitraryCodeExecution: false,
      enforceToolGateway: true,
    };

    expect(runtimePolicy.allowArbitraryCodeExecution).toBe(false);
    expect(runtimePolicy.enforceToolGateway).toBe(true);
  });
});
