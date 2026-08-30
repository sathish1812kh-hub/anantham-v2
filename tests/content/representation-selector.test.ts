import { describe, it, expect } from "vitest";
import { RepresentationSelector } from "../../src/content/representation-selector.js";
import { ContentIngestionEngine } from "../../src/content/content-ingestion-engine.js";

describe("P2.1 Content Subsystem — Representation Selector & Modality Matching", () => {
  it("selects native image representation for vision-capable models", async () => {
    // Synthetic PNG
    const pngHeader = Buffer.alloc(24);
    pngHeader[0] = 0x89;
    pngHeader[1] = 0x50;
    pngHeader[2] = 0x4e;
    pngHeader[3] = 0x47;

    const content = await ContentIngestionEngine.ingest({
      data: pngHeader,
      name: "diagram.png",
      source: { type: "upload" },
    });

    const result = RepresentationSelector.selectOptimalRepresentation(content, {
      modelId: "gpt-4o",
      supportedModalities: ["text", "image"],
    });

    expect(result.isNativeModality).toBe(true);
    expect(result.representation.type).toBe("image");
  });

  it("falls back to metadata representation for text-only models with image content", async () => {
    const pngHeader = Buffer.alloc(24);
    pngHeader[0] = 0x89;
    pngHeader[1] = 0x50;
    pngHeader[2] = 0x4e;
    pngHeader[3] = 0x47;

    const content = await ContentIngestionEngine.ingest({
      data: pngHeader,
      name: "diagram.png",
      source: { type: "upload" },
    });

    const result = RepresentationSelector.selectOptimalRepresentation(content, {
      modelId: "claude-3-haiku-text",
      supportedModalities: ["text"],
    });

    expect(result.isNativeModality).toBe(false);
    expect(result.representation.type).toBe("metadata");
  });

  it("enforces max token budget and truncates oversized text representations", async () => {
    const longText = "word ".repeat(500); // 2500 chars, ~625 tokens
    const content = await ContentIngestionEngine.ingest({
      data: longText,
      name: "long_doc.txt",
      source: { type: "upload" },
    });

    const result = RepresentationSelector.selectOptimalRepresentation(content, {
      modelId: "small-context-model",
      supportedModalities: ["text"],
      maxTokensPerItem: 50, // Limit to 50 tokens
    });

    expect(result.wasTruncated).toBe(true);
    expect(result.representation.data).toContain("[TRUNCATED DUE TO TOKEN BUDGET]");
    expect(result.representation.data!.length).toBeLessThan(longText.length);
  });
});
