import { describe, it, expect } from "vitest";
import { ConflictDetector } from "../../src/execution/conflict-detector.js";
import { type ChangeSetMetadata } from "../../src/domain/workspace.js";

describe("P6.4 Parallel Execution — Contract, Migration, Event and Public API Conflicts", () => {
  const detector = new ConflictDetector();

  it("detects CONTRACT_CONFLICT when two agents concurrently modify domain contracts", () => {
    const cs1: ChangeSetMetadata = {
      workspaceId: "ws_con1",
      baseCommit: "commit_base",
      headCommit: "commit_con1",
      targetCommit: "commit_base",
      filesAdded: [],
      filesModified: ["src/domain/task.ts"],
      filesDeleted: [],
      filesRenamed: [],
      fileHashes: { "src/domain/task.ts": "h1" },
      patch: "",
      changeSetHash: "h1",
      createdAt: new Date().toISOString(),
    };

    const cs2: ChangeSetMetadata = {
      workspaceId: "ws_con2",
      baseCommit: "commit_base",
      headCommit: "commit_con2",
      targetCommit: "commit_base",
      filesAdded: [],
      filesModified: ["src/domain/agent.ts"],
      filesDeleted: [],
      filesRenamed: [],
      fileHashes: { "src/domain/agent.ts": "h2" },
      patch: "",
      changeSetHash: "h2",
      createdAt: new Date().toISOString(),
    };

    const conflict = detector.detectConflicts(cs1, [cs2]);
    expect(conflict).not.toBeNull();
    expect(conflict?.conflictType).toBe("CONTRACT_CONFLICT");
    expect(conflict?.reconciliationSuggestion).toBe("RESERIALIZE");
  });

  it("detects MIGRATION_CONFLICT when two agents add database migrations", () => {
    const cs1: ChangeSetMetadata = {
      workspaceId: "ws_mig1",
      baseCommit: "commit_base",
      headCommit: "commit_mig1",
      targetCommit: "commit_base",
      filesAdded: ["src/persistence/migrations/005_feature_a.ts"],
      filesModified: [],
      filesDeleted: [],
      filesRenamed: [],
      fileHashes: { "src/persistence/migrations/005_feature_a.ts": "h1" },
      patch: "",
      changeSetHash: "h1",
      createdAt: new Date().toISOString(),
    };

    const cs2: ChangeSetMetadata = {
      workspaceId: "ws_mig2",
      baseCommit: "commit_base",
      headCommit: "commit_mig2",
      targetCommit: "commit_base",
      filesAdded: ["src/persistence/migrations/005_feature_b.ts"],
      filesModified: [],
      filesDeleted: [],
      filesRenamed: [],
      fileHashes: { "src/persistence/migrations/005_feature_b.ts": "h2" },
      patch: "",
      changeSetHash: "h2",
      createdAt: new Date().toISOString(),
    };

    const conflict = detector.detectConflicts(cs1, [cs2]);
    expect(conflict).not.toBeNull();
    expect(conflict?.conflictType).toBe("MIGRATION_CONFLICT");
  });

  it("detects EVENT_SCHEMA_CONFLICT when both agents modify event.ts", () => {
    const cs1: ChangeSetMetadata = {
      workspaceId: "ws_evt1",
      baseCommit: "commit_base",
      headCommit: "commit_evt1",
      targetCommit: "commit_base",
      filesAdded: [],
      filesModified: ["src/domain/event.ts"],
      filesDeleted: [],
      filesRenamed: [],
      fileHashes: { "src/domain/event.ts": "h1" },
      patch: "",
      changeSetHash: "h1",
      createdAt: new Date().toISOString(),
    };

    const cs2: ChangeSetMetadata = {
      workspaceId: "ws_evt2",
      baseCommit: "commit_base",
      headCommit: "commit_evt2",
      targetCommit: "commit_base",
      filesAdded: [],
      filesModified: ["src/domain/event.ts"],
      filesDeleted: [],
      filesRenamed: [],
      fileHashes: { "src/domain/event.ts": "h2" },
      patch: "",
      changeSetHash: "h2",
      createdAt: new Date().toISOString(),
    };

    const conflict = detector.detectConflicts(cs1, [cs2]);
    expect(conflict).not.toBeNull();
    expect(conflict?.conflictType).toBe("EVENT_SCHEMA_CONFLICT");
  });

  it("detects PUBLIC_API_CONFLICT when both agents modify src/index.ts", () => {
    const cs1: ChangeSetMetadata = {
      workspaceId: "ws_idx1",
      baseCommit: "commit_base",
      headCommit: "commit_idx1",
      targetCommit: "commit_base",
      filesAdded: [],
      filesModified: ["src/index.ts"],
      filesDeleted: [],
      filesRenamed: [],
      fileHashes: { "src/index.ts": "h1" },
      patch: "",
      changeSetHash: "h1",
      createdAt: new Date().toISOString(),
    };

    const cs2: ChangeSetMetadata = {
      workspaceId: "ws_idx2",
      baseCommit: "commit_base",
      headCommit: "commit_idx2",
      targetCommit: "commit_base",
      filesAdded: [],
      filesModified: ["src/index.ts"],
      filesDeleted: [],
      filesRenamed: [],
      fileHashes: { "src/index.ts": "h2" },
      patch: "",
      changeSetHash: "h2",
      createdAt: new Date().toISOString(),
    };

    const conflict = detector.detectConflicts(cs1, [cs2]);
    expect(conflict).not.toBeNull();
    expect(conflict?.conflictType).toBe("PUBLIC_API_CONFLICT");
  });
});
