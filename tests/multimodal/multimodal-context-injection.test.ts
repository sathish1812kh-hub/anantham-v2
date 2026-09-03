import { describe, it, expect } from "vitest";
import { MultimodalContextInjector } from "../../src/multimodal/multimodal-context-injector.js";
import type { MultimodalContextItem } from "../../src/multimodal/types.js";

describe("PRD-MM-003: Multimodal Context Injection", () => {
  const injector = new MultimodalContextInjector({ maxTokens: 1000 });

  const testItems: MultimodalContextItem[] = [
    {
      id: "img_001",
      kind: "image",
      mimeType: "image/png",
      referencePath: "/workspace/diagram.png",
      estimatedTokens: 250,
      metadata: { width: 800, height: 600 },
    },
    {
      id: "doc_002",
      kind: "document",
      mimeType: "application/pdf",
      referencePath: "/workspace/specs.pdf",
      estimatedTokens: 500,
      metadata: { pages: 2 },
    },
  ];

  it("injects multimodal items using reference style", () => {
    const result = injector.injectItems(testItems, "reference");
    expect(result.itemsIncluded).toBe(2);
    expect(result.totalTokens).toBe(750);
    expect(result.formattedContext).toContain("[MULTIMODAL_REF id=\"img_001\"");
    expect(result.formattedContext).toContain("[MULTIMODAL_REF id=\"doc_002\"");
  });

  it("injects multimodal items using markdown block style", () => {
    const result = injector.injectItems(testItems, "multimodal_block");
    expect(result.itemsIncluded).toBe(2);
    expect(result.formattedContext).toContain("```multimodal\nid: img_001");
  });
});
