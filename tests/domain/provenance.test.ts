import { describe, it, expect } from "vitest";
import { ProvenanceSchema, type Provenance } from "../../src/domain/provenance.js";

describe("Provenance Domain Contracts", () => {
  it("validates valid Provenance with extractor and parent IDs", () => {
    const prov: Provenance = {
      sourceType: "filesystem",
      sourceId: "file_123",
      sourceUri: "file:///C:/project/src/auth.ts",
      parentIds: ["event_001", "task_010"],
      capturedAt: "2026-08-30T20:00:00.000Z",
      extractor: {
        name: "ast-parser-ts",
        version: "2.1.0",
      },
      transformations: ["normalize-newlines", "strip-comments"],
    };

    const parsed = ProvenanceSchema.parse(prov);
    expect(parsed).toEqual(prov);
  });

  it("rejects empty source type", () => {
    const invalid = {
      sourceType: "",
      parentIds: [],
      capturedAt: "2026-08-30T20:00:00.000Z",
      transformations: [],
    };

    expect(() => ProvenanceSchema.parse(invalid)).toThrow();
  });
});
