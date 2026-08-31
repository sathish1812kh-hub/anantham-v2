import { describe, it, expect } from "vitest";
import {
  ExecutionWorkspaceSchema,
  ChangeSetMetadataSchema,
  ConflictClassificationSchema,
  ConflictReportSchema,
  IntegrationRequestSchema,
  IntegrationResultSchema,
  WorkspaceQuarantineRecordSchema,
} from "../../src/domain/workspace.js";

describe("P6.4 Parallel Execution — Workspace Contracts Validation", () => {
  it("validates valid ExecutionWorkspace and rejects malformed fields", () => {
    const valid = ExecutionWorkspaceSchema.parse({
      id: "ws_01",
      projectId: "proj_01",
      taskId: "task_01",
      agentId: "agent_01",
      instanceId: "inst_01",
      leaseId: "lease_01",
      generation: 1,
      baseCommit: "a".repeat(40),
      baseBranch: "main",
      worktreePath: "/tmp/worktree/ws_01",
      branchName: "anantham/ws-01",
      status: "READY",
      cleanupState: "NONE",
      createdAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
    });
    expect(valid.id).toBe("ws_01");

    // Rejects non-positive generation
    expect(() =>
      ExecutionWorkspaceSchema.parse({
        ...valid,
        generation: 0,
      })
    ).toThrow();

    // Rejects invalid status
    expect(() =>
      ExecutionWorkspaceSchema.parse({
        ...valid,
        status: "INVALID_STATUS",
      })
    ).toThrow();
  });

  it("validates ChangeSetMetadata schema and cryptographic hashes", () => {
    const changeSet = ChangeSetMetadataSchema.parse({
      workspaceId: "ws_01",
      baseCommit: "a".repeat(40),
      headCommit: "b".repeat(40),
      targetCommit: "a".repeat(40),
      filesAdded: ["src/new-feature.ts"],
      filesModified: ["src/domain/task.ts"],
      filesDeleted: ["src/old.ts"],
      filesRenamed: [{ from: "src/a.ts", to: "src/b.ts" }],
      fileHashes: {
        "src/new-feature.ts": "c".repeat(64),
        "src/domain/task.ts": "d".repeat(64),
      },
      symbolsModified: [
        { file: "src/domain/task.ts", symbol: "TaskSchema", kind: "const" },
      ],
      patch: "--- a/src/domain/task.ts\n+++ b/src/domain/task.ts\n@@ -1 +1 @@\n",
      changeSetHash: "e".repeat(64),
      createdAt: new Date().toISOString(),
    });
    expect(changeSet.filesAdded).toContain("src/new-feature.ts");
  });

  it("validates all 12 ConflictClassification categories", () => {
    const categories = [
      "NO_CONFLICT",
      "FILE_CONFLICT",
      "DELETE_MODIFY_CONFLICT",
      "RENAME_CONFLICT",
      "ADD_ADD_CONFLICT",
      "BASE_DIVERGENCE",
      "CONTRACT_CONFLICT",
      "MIGRATION_CONFLICT",
      "EVENT_SCHEMA_CONFLICT",
      "PUBLIC_API_CONFLICT",
      "USER_CHANGE_CONFLICT",
      "UNKNOWN_CONFLICT",
    ];

    for (const cat of categories) {
      expect(ConflictClassificationSchema.parse(cat)).toBe(cat);
    }
  });

  it("validates IntegrationRequest and IntegrationResult schemas", () => {
    const req = IntegrationRequestSchema.parse({
      workspaceId: "ws_01",
      taskId: "task_01",
      agentId: "agent_01",
      instanceId: "inst_01",
      leaseId: "lease_01",
      generation: 2,
      targetBranch: "main",
      runVerification: true,
    });
    expect(req.generation).toBe(2);

    const res = IntegrationResultSchema.parse({
      success: true,
      workspaceId: "ws_01",
      integratedCommit: "f".repeat(40),
      status: "INTEGRATED",
    });
    expect(res.status).toBe("INTEGRATED");
  });

  it("validates WorkspaceQuarantineRecord schema", () => {
    const record = WorkspaceQuarantineRecordSchema.parse({
      id: "quar_01",
      workspaceId: "ws_01",
      reason: "Agent crash with uncommitted work",
      patch: "diff --git a/file.ts b/file.ts\n",
      createdAt: new Date().toISOString(),
    });
    expect(record.reason).toContain("Agent crash");
  });
});
