import { describe, it, expect } from "vitest";
import {
  CheckpointSchema,
  CheckpointTypeSchema,
  type Checkpoint,
} from "../../src/domain/checkpoint.js";

describe("Checkpoint Domain Contracts", () => {
  const sampleSha256 = "d".repeat(64);

  it("validates a Checkpoint with full manifest", () => {
    const checkpoint: Checkpoint = {
      id: "chk_001",
      type: "automatic",
      projectId: "proj_01",
      sessionId: "sess_01",
      manifest: {
        schemaVersion: 1,
        eventOffset: 42,
        branch: "main",
        taskStateSummary: {
          task_01: "completed",
          task_02: "running",
        },
        memorySummary: "mem_digest_123",
        contextSummary: "ctx_summary_456",
        artifactHashes: {
          art_01: sampleSha256,
        },
        workspaceStateHash: sampleSha256,
        providerStateSummary: "healthy",
      },
      sha256: sampleSha256,
      createdAt: "2026-08-30T20:00:00.000Z",
      validationChecksum: "val_chk_789",
    };

    const parsed = CheckpointSchema.parse(checkpoint);
    expect(parsed).toEqual(checkpoint);
  });

  it("validates all PRD checkpoint trigger types", () => {
    const types = [
      "automatic",
      "manual",
      "pre-compaction",
      "pre-edit",
      "pre-risk",
      "pre-merge",
      "post-verification",
      "task-completion",
      "shutdown",
    ];

    for (const t of types) {
      expect(CheckpointTypeSchema.parse(t)).toBe(t);
    }
  });
});
