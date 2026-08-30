import { describe, it, expect } from "vitest";
import {
  ProjectSchema,
  SessionSchema,
  TaskSchema,
  HarnessEventSchema,
  CheckpointSchema,
  ContentObjectSchema,
  AttachmentSchema,
  ArtifactSchema,
  MemoryItemSchema,
  ContextPlanSchema,
  ProvenanceSchema,
  SecurityMetadataSchema,
} from "../../src/domain/index.js";

describe("Domain Lossless JSON Serialization Round-trips", () => {
  const sampleSha = "f".repeat(64);

  it("round-trips all core domain models losslessly", () => {
    // 1. SecurityMetadata
    const sec = SecurityMetadataSchema.parse({
      trust: "trusted",
      sensitivity: "normal",
      scanned: true,
      scanVersion: "1.0.0",
      authority: "developer",
      sandboxBoundary: "local",
    });
    expect(SecurityMetadataSchema.parse(JSON.parse(JSON.stringify(sec)))).toEqual(sec);

    // 2. Provenance
    const prov = ProvenanceSchema.parse({
      sourceType: "filesystem",
      parentIds: ["p1"],
      capturedAt: "2026-08-30T20:00:00.000Z",
      transformations: ["t1"],
    });
    expect(ProvenanceSchema.parse(JSON.parse(JSON.stringify(prov)))).toEqual(prov);

    // 3. ContentObject
    const cont = ContentObjectSchema.parse({
      id: "c1",
      kind: "code",
      mimeType: "text/typescript",
      name: "main.ts",
      sizeBytes: 120,
      sha256: sampleSha,
      source: { type: "filesystem", uri: "file:///src/main.ts" },
      representations: [
        {
          id: "r1",
          type: "code-ast",
          mimeType: "application/json",
          sizeBytes: 400,
          sha256: sampleSha,
          data: "{}",
        },
      ],
      provenance: prov,
      security: sec,
      createdAt: "2026-08-30T20:00:00.000Z",
      updatedAt: "2026-08-30T20:00:00.000Z",
    });
    expect(ContentObjectSchema.parse(JSON.parse(JSON.stringify(cont)))).toEqual(cont);

    // 4. Attachment
    const att = AttachmentSchema.parse({
      id: "att1",
      name: "file.txt",
      mimeType: "text/plain",
      sizeBytes: 10,
      sha256: sampleSha,
      source: "filesystem",
      sensitivity: "public",
      createdAt: "2026-08-30T20:00:00.000Z",
    });
    expect(AttachmentSchema.parse(JSON.parse(JSON.stringify(att)))).toEqual(att);

    // 5. Artifact
    const art = ArtifactSchema.parse({
      id: "art1",
      type: "diff",
      contentUri: "file:///diff.patch",
      sha256: sampleSha,
      sourceEventIds: ["evt1"],
      createdAt: "2026-08-30T20:00:00.000Z",
    });
    expect(ArtifactSchema.parse(JSON.parse(JSON.stringify(art)))).toEqual(art);

    // 6. MemoryItem
    const mem = MemoryItemSchema.parse({
      id: "mem1",
      scope: "project",
      type: "convention",
      content: "Use ESM",
      confidence: 1.0,
      priority: "HIGH",
      sourceEventIds: ["evt1"],
      createdAt: "2026-08-30T20:00:00.000Z",
      sensitivity: "normal",
    });
    expect(MemoryItemSchema.parse(JSON.parse(JSON.stringify(mem)))).toEqual(mem);

    // 7. ContextPlan
    const ctx = ContextPlanSchema.parse({
      id: "ctx1",
      items: [],
      estimatedTokens: 0,
      modalityUsage: {},
      omitted: [],
      decisions: [],
      createdAt: "2026-08-30T20:00:00.000Z",
    });
    expect(ContextPlanSchema.parse(JSON.parse(JSON.stringify(ctx)))).toEqual(ctx);

    // 8. HarnessEvent
    const evt = HarnessEventSchema.parse({
      id: "evt1",
      schemaVersion: 1,
      type: "task.started",
      actor: "agent",
      timestamp: "2026-08-30T20:00:00.000Z",
      payload: { ok: true },
    });
    expect(HarnessEventSchema.parse(JSON.parse(JSON.stringify(evt)))).toEqual(evt);

    // 9. Checkpoint
    const chk = CheckpointSchema.parse({
      id: "chk1",
      type: "automatic",
      projectId: "proj1",
      sessionId: "sess1",
      manifest: {
        schemaVersion: 1,
        eventOffset: 5,
        branch: "main",
        taskStateSummary: {},
        artifactHashes: {},
      },
      sha256: sampleSha,
      createdAt: "2026-08-30T20:00:00.000Z",
      validationChecksum: "chksum",
    });
    expect(CheckpointSchema.parse(JSON.parse(JSON.stringify(chk)))).toEqual(chk);

    // 10. Project
    const proj = ProjectSchema.parse({
      id: "proj1",
      name: "p1",
      rootPath: "C:/p1",
      status: "active",
      tags: [],
      modelProfile: "m",
      memoryNamespace: "mem",
      orchestrationProfile: "o",
      trustProfile: "trusted",
      createdAt: "2026-08-30T20:00:00.000Z",
      lastOpenedAt: "2026-08-30T20:00:00.000Z",
      lastActivityAt: "2026-08-30T20:00:00.000Z",
    });
    expect(ProjectSchema.parse(JSON.parse(JSON.stringify(proj)))).toEqual(proj);

    // 11. Session
    const sess = SessionSchema.parse({
      id: "sess1",
      projectId: "proj1",
      name: "s1",
      branch: "main",
      status: "active",
      modelProfile: "m",
      keyPoolProfile: "k",
      mode: "interactive",
      permissions: {},
      createdAt: "2026-08-30T20:00:00.000Z",
      updatedAt: "2026-08-30T20:00:00.000Z",
    });
    expect(SessionSchema.parse(JSON.parse(JSON.stringify(sess)))).toEqual(sess);

    // 12. Task
    const task = TaskSchema.parse({
      id: "task1",
      projectId: "proj1",
      sessionId: "sess1",
      objective: "Obj",
      status: "queued",
      priority: "normal",
      dependencies: [],
      inputArtifacts: [],
      outputArtifacts: [],
      createdAt: "2026-08-30T20:00:00.000Z",
      updatedAt: "2026-08-30T20:00:00.000Z",
    });
    expect(TaskSchema.parse(JSON.parse(JSON.stringify(task)))).toEqual(task);
  });
});
