import { describe, it, expect } from "vitest";
import { MultimodalContextInjector } from "../../src/multimodal/multimodal-context-injector.js";
import type { MultimodalContextItem } from "../../src/multimodal/types.js";

describe("PRD-INV-002: Strict Multimodal Integrity Invariants", () => {
  const injector = new MultimodalContextInjector({
    maxTokens: 500,
    maxSizeBytes: 1000,
    allowedFormats: ["image/png"],
  });

  it("rejects items exceeding token budgets or unsupported mime types", () => {
    const oversizedItem: MultimodalContextItem = {
      id: "huge_img",
      kind: "image",
      mimeType: "image/png",
      estimatedTokens: 600, // Exceeds 500 maxTokens
      metadata: {},
    };

    const oversizedCheck = injector.validateItem(oversizedItem);
    expect(oversizedCheck.valid).toBe(false);
    expect(oversizedCheck.reason).toContain("exceeds max budget limit");

    const unsupportedItem: MultimodalContextItem = {
      id: "exe_file",
      kind: "document",
      mimeType: "application/x-msdownload",
      estimatedTokens: 10,
      metadata: {},
    };

    const unsupportedCheck = injector.validateItem(unsupportedItem);
    expect(unsupportedCheck.valid).toBe(false);
    expect(unsupportedCheck.reason).toContain("Unsupported multimodal format");
  });

  it("strictly enforces token ceiling and halts injection before budget overflow", () => {
    const items: MultimodalContextItem[] = [
      { id: "1", kind: "image", mimeType: "image/png", estimatedTokens: 300, metadata: {} },
      { id: "2", kind: "image", mimeType: "image/png", estimatedTokens: 300, metadata: {} }, // 300 + 300 = 600 > 500
    ];

    const result = injector.injectItems(items, "reference");
    expect(result.itemsIncluded).toBe(1);
    expect(result.totalTokens).toBe(300);
  });
});
