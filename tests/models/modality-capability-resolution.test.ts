import { describe, it, expect } from "vitest";
import { CapabilityResolver } from "../../src/models/capability-resolver.js";
import {
  GPT_4O_PROFILE,
  TEXT_ONLY_LOCAL_PROFILE,
  GEMINI_1_5_PRO_PROFILE,
} from "../../src/models/capability-profiles.js";

describe("CapabilityResolver - Modality Resolution", () => {
  it("resolves text-only request as COMPATIBLE for text and multimodal models", () => {
    const textReq = { requiredInputs: ["text" as const] };

    const resGpt = CapabilityResolver.resolve(GPT_4O_PROFILE, textReq);
    expect(resGpt.compatible).toBe(true);
    expect(resGpt.status).toBe("COMPATIBLE");

    const resLocal = CapabilityResolver.resolve(TEXT_ONLY_LOCAL_PROFILE, textReq);
    expect(resLocal.compatible).toBe(true);
    expect(resLocal.status).toBe("COMPATIBLE");
  });

  it("resolves vision/image requirement as INCOMPATIBLE for text-only model", () => {
    const visionReq = {
      requiredInputs: ["text" as const, "image" as const],
    };

    const resLocal = CapabilityResolver.resolve(TEXT_ONLY_LOCAL_PROFILE, visionReq);
    expect(resLocal.compatible).toBe(false);
    expect(resLocal.status).toBe("INCOMPATIBLE");
    expect(resLocal.missingCapabilities).toContain("input:image");

    const resGpt = CapabilityResolver.resolve(GPT_4O_PROFILE, visionReq);
    expect(resGpt.compatible).toBe(true);
  });

  it("resolves video requirement as COMPATIBLE for Gemini but INCOMPATIBLE for GPT-4o", () => {
    const videoReq = {
      requiredInputs: ["video" as const],
    };

    const resGpt = CapabilityResolver.resolve(GPT_4O_PROFILE, videoReq);
    expect(resGpt.compatible).toBe(false);
    expect(resGpt.missingCapabilities).toContain("input:video");

    const resGemini = CapabilityResolver.resolve(GEMINI_1_5_PRO_PROFILE, videoReq);
    expect(resGemini.compatible).toBe(true);
  });
});
