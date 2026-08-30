import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { SessionTreeManager } from "../../src/event-state/session-tree/session-tree-manager.js";
import { ProjectRepository, SessionRepository } from "../../src/persistence/index.js";
import { EventTypes } from "../../src/domain/event.js";

describe("SessionTreeManager & Session Branching", () => {
  let engine: SqliteEngine;
  let eventStore: EventStore;
  let sessionRepo: SessionRepository;
  let treeManager: SessionTreeManager;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    const projectRepo = new ProjectRepository(engine);
    projectRepo.save({
      id: "proj_01",
      name: "Tree Project",
      rootPath: "C:/tree",
      status: "active",
      tags: [],
      modelProfile: "m",
      memoryNamespace: "mem",
      orchestrationProfile: "o",
      trustProfile: "developer",
      createdAt: "2026-08-30T20:00:00.000Z",
      lastOpenedAt: "2026-08-30T20:00:00.000Z",
      lastActivityAt: "2026-08-30T20:00:00.000Z",
    });

    sessionRepo = new SessionRepository(engine);
    eventStore = new EventStore(engine);
    treeManager = new SessionTreeManager(sessionRepo, eventStore);

    // Create root session
    sessionRepo.save({
      id: "sess_main",
      projectId: "proj_01",
      name: "Main Session",
      branch: "main",
      status: "active",
      modelProfile: "claude-3-5-sonnet",
      keyPoolProfile: "default",
      mode: "interactive",
      permissions: { "filesystem.write": true },
      createdAt: "2026-08-30T20:00:00.000Z",
      updatedAt: "2026-08-30T20:00:00.000Z",
    });
  });

  afterEach(() => {
    engine.close();
  });

  it("forks a session into a child branch and logs session.forked event without mutating parent", () => {
    const parentBefore = sessionRepo.findById("sess_main");

    const { newSession, forkEvent } = treeManager.forkSession("sess_main", {
      newSessionId: "sess_feature_auth",
      branch: "feature/auth",
    });

    expect(newSession.id).toBe("sess_feature_auth");
    expect(newSession.parentSessionId).toBe("sess_main");
    expect(newSession.branch).toBe("feature/auth");

    expect(forkEvent.type).toBe(EventTypes.SESSION_FORKED);
    expect(forkEvent.payload.parentSessionId).toBe("sess_main");

    // Verify parent was not mutated
    const parentAfter = sessionRepo.findById("sess_main");
    expect(parentAfter).toEqual(parentBefore);

    // Verify fork event exists in event store
    const events = eventStore.getEventsBySession("sess_feature_auth");
    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe(forkEvent.id);
  });

  it("traces session ancestry back to the root session", () => {
    // Branch 1: main -> feature/auth
    treeManager.forkSession("sess_main", {
      newSessionId: "sess_branch_1",
      branch: "feature/auth",
    });

    // Branch 2: feature/auth -> fix/token
    treeManager.forkSession("sess_branch_1", {
      newSessionId: "sess_branch_2",
      branch: "fix/token",
    });

    const ancestry = treeManager.getSessionAncestry("sess_branch_2");
    expect(ancestry).toHaveLength(3);
    expect(ancestry[0]?.id).toBe("sess_branch_2");
    expect(ancestry[1]?.id).toBe("sess_branch_1");
    expect(ancestry[2]?.id).toBe("sess_main");
  });

  it("builds a recursive session tree representing project branches", () => {
    treeManager.forkSession("sess_main", {
      newSessionId: "sess_b1",
      branch: "feat/1",
    });

    treeManager.forkSession("sess_main", {
      newSessionId: "sess_b2",
      branch: "feat/2",
    });

    treeManager.forkSession("sess_b1", {
      newSessionId: "sess_b1_sub",
      branch: "feat/1-sub",
    });

    const tree = treeManager.getSessionTree("proj_01");
    expect(tree).toHaveLength(1); // 1 root (sess_main)
    expect(tree[0]?.session.id).toBe("sess_main");
    expect(tree[0]?.children).toHaveLength(2); // sess_b1, sess_b2

    const b1Node = tree[0]?.children.find((c) => c.session.id === "sess_b1");
    expect(b1Node?.children).toHaveLength(1);
    expect(b1Node?.children[0]?.session.id).toBe("sess_b1_sub");

    const branches = treeManager.listBranches("proj_01");
    expect(branches).toContain("main");
    expect(branches).toContain("feat/1");
    expect(branches).toContain("feat/2");
    expect(branches).toContain("feat/1-sub");
  });
});
