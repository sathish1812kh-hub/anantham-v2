import { describe, it, expect } from "vitest";
import { ConflictDetector } from "../../src/execution/conflict-detector.js";
import { type ChangeSetMetadata } from "../../src/domain/workspace.js";

describe("P6.4 Parallel Execution — Delete/Modify and Rename Conflicts", () => {
  const detector = new ConflictDetector();

  it("detects DELETE_MODIFY_CONFLICT when one agent deletes a file modified by another", () => {
    const csDelete: ChangeSetMetadata = {
      workspaceId: "ws_del",
      baseCommit: "commit_base",
      headCommit: "commit_del",
      targetCommit: "commit_base",
      filesAdded: [],
      filesModified: [],
      filesDeleted: ["src/legacy.ts"],
      filesRenamed: [],
      fileHashes: {},
      patch: "",
      changeSetHash: "h1",
      createdAt: new Date().toISOString(),
    };

    const csModify: ChangeSetMetadata = {
      workspaceId: "ws_mod",
      baseCommit: "commit_base",
      headCommit: "commit_mod",
      targetCommit: "commit_base",
      filesAdded: [],
      filesModified: ["src/legacy.ts"],
      filesDeleted: [],
      filesRenamed: [],
      fileHashes: { "src/legacy.ts": "h2" },
      patch: "",
      changeSetHash: "h2",
      createdAt: new Date().toISOString(),
    };

    const conflict = detector.detectConflicts(csDelete, [csModify]);
    expect(conflict).not.toBeNull();
    expect(conflict?.conflictType).toBe("DELETE_MODIFY_CONFLICT");
    expect(conflict?.conflictingFiles).toContain("src/legacy.ts");
  });

  it("detects RENAME_CONFLICT when two agents rename different files to the same target path", () => {
    const csRename1: ChangeSetMetadata = {
      workspaceId: "ws_ren1",
      baseCommit: "commit_base",
      headCommit: "commit_ren1",
      targetCommit: "commit_base",
      filesAdded: [],
      filesModified: [],
      filesDeleted: [],
      filesRenamed: [{ from: "src/old1.ts", to: "src/target.ts" }],
      fileHashes: {},
      patch: "",
      changeSetHash: "h3",
      createdAt: new Date().toISOString(),
    };

    const csRename2: ChangeSetMetadata = {
      workspaceId: "ws_ren2",
      baseCommit: "commit_base",
      headCommit: "commit_ren2",
      targetCommit: "commit_base",
      filesAdded: [],
      filesModified: [],
      filesDeleted: [],
      filesRenamed: [{ from: "src/old2.ts", to: "src/target.ts" }],
      fileHashes: {},
      patch: "",
      changeSetHash: "h4",
      createdAt: new Date().toISOString(),
    };

    const conflict = detector.detectConflicts(csRename1, [csRename2]);
    expect(conflict).not.toBeNull();
    expect(conflict?.conflictType).toBe("RENAME_CONFLICT");
    expect(conflict?.conflictingFiles).toContain("src/target.ts");
  });

  it("detects ADD_ADD_CONFLICT when two agents add the same file with differing content", () => {
    const csAdd1: ChangeSetMetadata = {
      workspaceId: "ws_add1",
      baseCommit: "commit_base",
      headCommit: "commit_add1",
      targetCommit: "commit_base",
      filesAdded: ["src/utils/math.ts"],
      filesModified: [],
      filesDeleted: [],
      filesRenamed: [],
      fileHashes: { "src/utils/math.ts": "hash_version_1" },
      patch: "",
      changeSetHash: "h5",
      createdAt: new Date().toISOString(),
    };

    const csAdd2: ChangeSetMetadata = {
      workspaceId: "ws_add2",
      baseCommit: "commit_base",
      headCommit: "commit_add2",
      targetCommit: "commit_base",
      filesAdded: ["src/utils/math.ts"],
      filesModified: [],
      filesDeleted: [],
      filesRenamed: [],
      fileHashes: { "src/utils/math.ts": "hash_version_2" },
      patch: "",
      changeSetHash: "h6",
      createdAt: new Date().toISOString(),
    };

    const conflict = detector.detectConflicts(csAdd1, [csAdd2]);
    expect(conflict).not.toBeNull();
    expect(conflict?.conflictType).toBe("ADD_ADD_CONFLICT");
    expect(conflict?.conflictingFiles).toContain("src/utils/math.ts");
  });
});
