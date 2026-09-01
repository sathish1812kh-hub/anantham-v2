import { describe, it, expect } from "vitest";
import { ContentIngestionEngine } from "../../src/content/content-ingestion-engine.js";
import { RepresentationSelector, ModelModalityProfile } from "../../src/content/representation-selector.js";

describe("P9.4 Multimodal — Multimodal Capability Matrix Resolution", () => {
  it("resolves capabilities correctly across the full multimodal matrix", async () => {
    // 1. Text Content
    const textContent = await ContentIngestionEngine.ingest({
      name: "doc.txt",
      data: Buffer.from("Hello world", "utf8"),
      source: { type: "upload" },
    });

    // 2. Image Content
    const imageContent = await ContentIngestionEngine.ingest({
      name: "img.png",
      data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      source: { type: "upload" },
    });

    // 3. Audio Content
    const audioContent = await ContentIngestionEngine.ingest({
      name: "audio.mp3",
      data: Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00]),
      source: { type: "upload" },
    });

    // Model Profiles
    const textOnlyProfile: ModelModalityProfile = {
      modelId: "text-llm",
      supportedModalities: ["text"],
    };

    const visionProfile: ModelModalityProfile = {
      modelId: "multimodal-vision-llm",
      supportedModalities: ["text", "image"],
    };

    const omniProfile: ModelModalityProfile = {
      modelId: "omni-llm",
      supportedModalities: ["text", "image", "audio", "video"],
    };

    // Matrix Evaluation:
    // Case 1: Text on Text-only -> Native text
    const r1 = RepresentationSelector.selectOptimalRepresentation(textContent, textOnlyProfile);
    expect(r1.isNativeModality).toBe(true);

    // Case 2: Image on Text-only -> Non-native fallback
    const r2 = RepresentationSelector.selectOptimalRepresentation(imageContent, textOnlyProfile);
    expect(r2.isNativeModality).toBe(false);

    // Case 3: Image on Vision -> Native image
    const r3 = RepresentationSelector.selectOptimalRepresentation(imageContent, visionProfile);
    expect(r3.isNativeModality).toBe(true);
    expect(r3.representation.type).toBe("image");

    // Case 4: Audio on Vision -> Non-native fallback
    const r4 = RepresentationSelector.selectOptimalRepresentation(audioContent, visionProfile);
    expect(r4.isNativeModality).toBe(false);

    // Case 5: Audio on Omni -> Native audio
    const r5 = RepresentationSelector.selectOptimalRepresentation(audioContent, omniProfile);
    expect(r5.isNativeModality).toBe(true);
    expect(r5.representation.type).toBe("audio");
  });
});
