import { describe, it, expect } from "vitest";
import { ConflictDetector } from "../../src/execution/conflict-detector.js";
import { type ChangeSetMetadata } from "../../src/domain/workspace.js";

describe("P6.4 Parallel Execution — Same-File Conflict Detection", () => {
  const detector = new ConflictDetector();

  it("detects FILE_CONFLICT when two parallel workspaces modify the same file", () => {
    const cs1: ChangeSetMetadata = {
      workspaceId: "ws_alpha",
      baseCommit: "commit_base",
      headCommit: "commit_alpha",
      targetCommit: "commit_base",
      filesAdded: [],
      filesModified: ["src/feature/login.ts"],
      filesDeleted: [],
      filesRenamed: [],
      fileHashes: { "src/feature/login.ts": "hash_a" },
      patch: "",
      changeSetHash: "cs_hash_1",
      createdAt: new Date().toISOString(),
    };

    const cs2: ChangeSetMetadata = {
      workspaceId: "ws_beta",
      baseCommit: "commit_base",
      headCommit: "commit_beta",
      targetCommit: "commit_base",
      filesAdded: [],
      filesModified: ["src/feature/login.ts"],
      filesDeleted: [],
      filesRenamed: [],
      fileHashes: { "src/feature/login.ts": "hash_b" },
      patch: "",
      changeSetHash: "cs_hash_2",
      createdAt: new Date().toISOString(),
    };

    const conflict = detector.detectConflicts(cs1, [cs2]);
    expect(conflict).not.toBeNull();
    expect(conflict?.conflictType).toBe("FILE_CONFLICT");
    expect(conflict?.conflictingFiles).toContain("src/feature/login.ts");
    expect(conflict?.conflictingWorkspaceId).toBe("ws_beta");
    expect(conflict?.reconciliationSuggestion).toBe("RESERIALIZE");
  });

  it("returns NO_CONFLICT when two parallel workspaces modify disjoint files", () => {
    const cs1: ChangeSetMetadata = {
      workspaceId: "ws_alpha",
      baseCommit: "commit_base",
      headCommit: "commit_alpha",
      targetCommit: "commit_base",
      filesAdded: ["src/feature/auth.ts"],
      filesModified: [],
      filesDeleted: [],
      filesRenamed: [],
      fileHashes: { "src/feature/auth.ts": "hash_a" },
      patch: "",
      changeSetHash: "cs_hash_1",
      createdAt: new Date().toISOString(),
    };

    const cs2: ChangeSetMetadata = {
      workspaceId: "ws_beta",
      baseCommit: "commit_base",
      headCommit: "commit_beta",
      targetCommit: "commit_base",
      filesAdded: ["src/feature/billing.ts"],
      filesModified: [],
      filesDeleted: [],
      filesRenamed: [],
      fileHashes: { "src/feature/billing.ts": "hash_b" },
      patch: "",
      changeSetHash: "cs_hash_2",
      createdAt: new Date().toISOString(),
    };

    const conflict = detector.detectConflicts(cs1, [cs2]);
    expect(conflict).toBeNull();
  });
});
