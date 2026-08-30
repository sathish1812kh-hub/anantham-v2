import { describe, it, expect } from "vitest";
import {
  ContentObjectSchema,
  ContentKindSchema,
  ContentRepresentationSchema,
  type ContentObject,
} from "../../src/domain/content.js";

describe("ContentObject Domain Contracts", () => {
  const sampleSha256 = "a".repeat(64);

  it("validates a complete ContentObject with multiple representations", () => {
    const contentObj: ContentObject = {
      id: "cont_001",
      kind: "document",
      mimeType: "application/pdf",
      name: "system_specification.pdf",
      sizeBytes: 1048576,
      sha256: sampleSha256,
      source: {
        type: "upload",
        uri: "file:///tmp/spec.pdf",
      },
      representations: [
        {
          id: "rep_text",
          type: "text",
          mimeType: "text/plain",
          sizeBytes: 4500,
          sha256: sampleSha256,
          data: "Extracted full plain text of specification...",
        },
        {
          id: "rep_toc",
          type: "json",
          mimeType: "application/json",
          sizeBytes: 500,
          sha256: sampleSha256,
          data: JSON.stringify({ chapters: ["Intro", "Arch"] }),
        },
      ],
      provenance: {
        sourceType: "user-upload",
        parentIds: [],
        capturedAt: "2026-08-30T20:00:00.000Z",
        transformations: [],
      },
      security: {
        trust: "user-content",
        sensitivity: "normal",
        scanned: true,
      },
      createdAt: "2026-08-30T20:00:00.000Z",
      updatedAt: "2026-08-30T20:00:00.000Z",
    };

    const parsed = ContentObjectSchema.parse(contentObj);
    expect(parsed).toEqual(contentObj);
  });

  it("validates all PRD content kinds", () => {
    const kinds = [
      "text",
      "code",
      "image",
      "document",
      "table",
      "audio",
      "video",
      "archive",
      "binary",
      "artifact",
      "web",
      "mcp-resource",
    ];

    for (const k of kinds) {
      expect(ContentKindSchema.parse(k)).toBe(k);
    }
  });

  it("rejects invalid sha256 hash length", () => {
    expect(() =>
      ContentRepresentationSchema.parse({
        id: "rep_1",
        type: "raw",
        mimeType: "application/octet-stream",
        sizeBytes: 10,
        sha256: "too_short",
      })
    ).toThrow();
  });
});
