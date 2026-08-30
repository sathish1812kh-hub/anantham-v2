import { describe, it, expect } from "vitest";
import {
  ArtifactSchema,
  ArtifactTypeSchema,
  type Artifact,
} from "../../src/domain/artifact.js";

describe("Artifact Domain Contracts", () => {
  const sampleSha256 = "c".repeat(64);

  it("validates a verified Artifact with lineage and check reports", () => {
    const artifact: Artifact = {
      id: "art_001",
      type: "plan",
      projectId: "proj_01",
      sessionId: "sess_01",
      taskId: "task_01",
      agentId: "agent_planner",
      contentUri: "file:///C:/herness/artifacts/plan.md",
      previewUri: "file:///C:/herness/artifacts/plan_preview.png",
      sha256: sampleSha256,
      sourceEventIds: ["evt_001", "evt_002"],
      verification: {
        status: "verified",
        checks: ["schema-valid", "dependencies-verified"],
        verifiedAt: "2026-08-30T20:10:00.000Z",
        verifierId: "agent_verifier",
      },
      createdAt: "2026-08-30T20:05:00.000Z",
      metadata: { author: "Anantham Planner" },
    };

    const parsed = ArtifactSchema.parse(artifact);
    expect(parsed).toEqual(artifact);
  });

  it("validates standard artifact types", () => {
    const types = [
      "plan",
      "task-list",
      "diff",
      "patch",
      "screenshot",
      "image",
      "pdf",
      "research-report",
      "test-report",
      "build-report",
      "review-report",
      "security-report",
      "browser-trace",
      "recording",
      "log",
      "generated-file",
      "diagram",
      "verification-result",
      "custom",
    ];

    for (const t of types) {
      expect(ArtifactTypeSchema.parse(t)).toBe(t);
    }
  });
});
