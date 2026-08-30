import { describe, it, expect } from "vitest";
import { CapabilityResolver } from "../../src/models/capability-resolver.js";
import {
  GPT_4O_PROFILE,
  TEXT_ONLY_LOCAL_PROFILE,
} from "../../src/models/capability-profiles.js";

describe("CapabilityResolver - Context & Output Limit Constraints", () => {
  it("resolves LIMIT_EXCEEDED when requested context exceeds model contextWindow", () => {
    const hugeContextReq = {
      minContextTokens: 32000, // Local profile only supports 8192
    };

    const res = CapabilityResolver.resolve(TEXT_ONLY_LOCAL_PROFILE, hugeContextReq);
    expect(res.compatible).toBe(false);
    expect(res.status).toBe("LIMIT_EXCEEDED");
    expect(res.insufficientLimits.length).toBe(1);
    expect(res.insufficientLimits[0].limit).toBe("contextWindow");
    expect(res.insufficientLimits[0].required).toBe(32000);
    expect(res.insufficientLimits[0].supported).toBe(8192);
  });

  it("resolves COMPATIBLE when requested context is within limit", () => {
    const normalReq = {
      minContextTokens: 64000, // GPT-4o supports 128000
      requiredOutputTokens: 4096, // GPT-4o supports 16384
    };

    const res = CapabilityResolver.resolve(GPT_4O_PROFILE, normalReq);
    expect(res.compatible).toBe(true);
    expect(res.status).toBe("COMPATIBLE");
  });
});
