import { describe, it, expect } from "vitest";
import { AttachmentSchema, type Attachment } from "../../src/domain/attachment.js";

describe("Attachment Domain Contracts", () => {
  const sampleSha256 = "b".repeat(64);

  it("validates a valid Attachment", () => {
    const attachment: Attachment = {
      id: "att_001",
      name: "diagram.png",
      mimeType: "image/png",
      sizeBytes: 204800,
      sha256: sampleSha256,
      source: "clipboard",
      projectId: "proj_01",
      sessionId: "sess_01",
      taskId: "task_01",
      sensitivity: "normal",
      createdAt: "2026-08-30T20:00:00.000Z",
    };

    const parsed = AttachmentSchema.parse(attachment);
    expect(parsed).toEqual(attachment);
  });

  it("rejects negative size bytes", () => {
    expect(() =>
      AttachmentSchema.parse({
        id: "att_002",
        name: "test.txt",
        mimeType: "text/plain",
        sizeBytes: -5,
        sha256: sampleSha256,
        source: "filesystem",
        sensitivity: "public",
        createdAt: "2026-08-30T20:00:00.000Z",
      })
    ).toThrow();
  });
});
