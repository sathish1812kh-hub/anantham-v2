import { describe, it, expect } from "vitest";
import { ContextEngine } from "../../src/context/context-engine.js";
import type { ContentObject } from "../../src/domain/content.js";

describe("ContextEngine - Capability & Modality Matching", () => {
  const sampleImageContent: ContentObject = {
    id: "cnt_image_01",
    kind: "image",
    mime: "image/png",
    sizeBytes: 1024,
    sha256: "a".repeat(64),
    security: {
      trust: "user-content",
      sensitivity: "normal",
      encryption: "none",
    },
    provenance: {
      sourceId: "src_user_upload",
      sourceType: "user-upload",
      createdAt: new Date().toISOString(),
    },
    representations: [
      {
        type: "image",
        mime: "image/png",
        uri: "file:///images/diagram.png",
      },
      {
        type: "text",
        mime: "text/plain",
        data: "[Image: Architectural flow diagram showing 3 nodes]",
      },
    ],
  };

  it("selects native image representation when model supports vision", async () => {
    const plan = await ContextEngine.assembleContext({
      sessionId: "ses_01",
      projectId: "prj_01",
      modelProfile: {
        modelId: "gpt-4o",
        supportedModalities: ["text", "image"],
      },
      candidates: [
        {
          id: "cand_img",
          sourceType: "attachment",
          sourceId: "img_01",
          contentObject: sampleImageContent,
          priority: "HIGH",
          authority: "attachment",
          selectedBecause: "User uploaded architectural diagram",
        },
      ],
    });

    expect(plan.items.length).toBe(1);
    expect(plan.items[0].representationType).toBe("image");
    expect(plan.items[0].uri).toBe("file:///images/diagram.png");
  });

  it("falls back to text representation when model is text-only", async () => {
    const plan = await ContextEngine.assembleContext({
      sessionId: "ses_01",
      projectId: "prj_01",
      modelProfile: {
        modelId: "claude-3-haiku-text",
        supportedModalities: ["text"],
      },
      candidates: [
        {
          id: "cand_img",
          sourceType: "attachment",
          sourceId: "img_01",
          contentObject: sampleImageContent,
          priority: "HIGH",
          authority: "attachment",
          selectedBecause: "User uploaded architectural diagram",
        },
      ],
    });

    expect(plan.items.length).toBe(1);
    expect(plan.items[0].representationType).toBe("text");
    expect(plan.items[0].content).toContain("[Image: Architectural flow diagram");
  });
});
