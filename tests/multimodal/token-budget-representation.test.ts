import { describe, it, expect } from "vitest";
import { ContentIngestionEngine } from "../../src/content/content-ingestion-engine.js";
import { RepresentationSelector, ModelModalityProfile } from "../../src/content/representation-selector.js";

describe("P9.4 Multimodal — Token Budget Enforcement & Representation Selection", () => {
  it("selects native vision representation when model supports vision", async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const content = await ContentIngestionEngine.ingest({
      name: "diagram.png",
      data: pngBytes,
      source: { type: "upload" },
    });

    const visionProfile: ModelModalityProfile = {
      modelId: "gemini-1.5-pro",
      supportedModalities: ["text", "image"],
    };

    const res = RepresentationSelector.selectOptimalRepresentation(content, visionProfile);
    expect(res.isNativeModality).toBe(true);
    expect(res.representation.type).toBe("image");
  });

  it("falls back to metadata representation when model is text-only", async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const content = await ContentIngestionEngine.ingest({
      name: "diagram.png",
      data: pngBytes,
      source: { type: "upload" },
    });

    const textOnlyProfile: ModelModalityProfile = {
      modelId: "gpt-3.5-turbo-instruct",
      supportedModalities: ["text"],
    };

    const res = RepresentationSelector.selectOptimalRepresentation(content, textOnlyProfile);
    expect(res.isNativeModality).toBe(false);
    expect(res.representation.type === "metadata" || res.representation.type === "text").toBe(true);
  });

  it("enforces token budget and truncates oversized text content deterministically", async () => {
    // Large 20,000 character string (~5,000 tokens)
    const largeText = "A".repeat(20000);
    const content = await ContentIngestionEngine.ingest({
      name: "massive_log.txt",
      data: Buffer.from(largeText, "utf8"),
      source: { type: "upload" },
    });

    const budgetProfile: ModelModalityProfile = {
      modelId: "claude-3-haiku",
      supportedModalities: ["text"],
      maxTokensPerItem: 500, // Budget 500 tokens
    };

    const res = RepresentationSelector.selectOptimalRepresentation(content, budgetProfile);
    expect(res.wasTruncated).toBe(true);
    expect(res.estimatedTokens).toBeLessThanOrEqual(500);
    expect(typeof res.representation.data === "string" && res.representation.data).toContain("TRUNCATED DUE TO TOKEN BUDGET");
  });

  it("produces identical selection results on repeated invocations with same inputs (Determinism)", async () => {
    const textData = "Sample deterministic payload for token budgeting test.";
    const content = await ContentIngestionEngine.ingest({
      name: "sample.txt",
      data: Buffer.from(textData, "utf8"),
      source: { type: "upload" },
    });

    const profile: ModelModalityProfile = {
      modelId: "gpt-4o",
      supportedModalities: ["text", "image"],
      maxTokensPerItem: 1000,
    };

    const res1 = RepresentationSelector.selectOptimalRepresentation(content, profile);
    const res2 = RepresentationSelector.selectOptimalRepresentation(content, profile);

    expect(res1).toEqual(res2);
  });
});
