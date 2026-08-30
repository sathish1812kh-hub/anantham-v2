import { describe, it, expect } from "vitest";
import { RepresentationSelector } from "../../src/content/representation-selector.js";
import { CapabilityResolver } from "../../src/models/capability-resolver.js";
import {
  GPT_4O_PROFILE,
  TEXT_ONLY_LOCAL_PROFILE,
} from "../../src/models/capability-profiles.js";
import type { ContentObject } from "../../src/domain/content.js";

describe("Content Pipeline -> CapabilityResolver Integration", () => {
  it("negotiates image content representation and checks model compatibility", () => {
    const imageContent: ContentObject = {
      id: "cnt_img_01",
      kind: "image",
      canonicalMime: "image/png",
      byteSize: 1024,
      sha256: "abc123hash",
      representations: [
        { type: "image", mimeType: "image/png", byteSize: 1024, tokenEstimate: 500 },
        { type: "text", data: "Extracted image text", byteSize: 20, tokenEstimate: 5 },
      ],
      trustLevel: "trusted",
      sensitivity: "normal",
      createdAt: new Date().toISOString(),
    };

    // 1. Check with GPT-4o (supports image input)
    const gptProfile = {
      modelId: "gpt-4o",
      supportedModalities: ["text", "image"] as Array<"text" | "image">,
    };
    const selGpt = RepresentationSelector.selectOptimalRepresentation(
      imageContent,
      gptProfile
    );
    expect(selGpt.isNativeModality).toBe(true);
    expect(selGpt.representation.type).toBe("image");

    const resGpt = CapabilityResolver.resolve(GPT_4O_PROFILE, {
      requiredInputs: ["image"],
    });
    expect(resGpt.compatible).toBe(true);

    // 2. Check with Text-Only local profile (no image input)
    const localProfile = {
      modelId: "local-llama",
      supportedModalities: ["text"] as Array<"text" | "image">,
    };
    const selLocal = RepresentationSelector.selectOptimalRepresentation(
      imageContent,
      localProfile
    );
    expect(selLocal.isNativeModality).toBe(false);
    expect(selLocal.representation.type).toBe("text"); // Fell back to text

    // Direct image requirement on text model fails
    const resLocal = CapabilityResolver.resolve(TEXT_ONLY_LOCAL_PROFILE, {
      requiredInputs: ["image"],
    });
    expect(resLocal.compatible).toBe(false);
    expect(resLocal.missingCapabilities).toContain("input:image");

    // But fallen-back OCR text requirement succeeds
    const resLocalText = CapabilityResolver.resolve(TEXT_ONLY_LOCAL_PROFILE, {
      requiredInputs: ["text"],
    });
    expect(resLocalText.compatible).toBe(true);
  });
});
