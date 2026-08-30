import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ArtifactRepository } from "../../src/persistence/repositories/artifact-repository.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { ArtifactManager } from "../../src/artifacts/artifact-manager.js";

describe("ArtifactManager - Durable Atomic Writes & Persistence", () => {
  let tempDir: string;
  let engine: SqliteEngine;
  let repository: ArtifactRepository;
  let manager: ArtifactManager;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "anantham-artifact-test-"));
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    new MigrationEngine(engine).migrate();

    const now = new Date().toISOString();
    const projectRepo = new ProjectRepository(engine);
    const sessionRepo = new SessionRepository(engine);

    projectRepo.save({
      id: "prj_01",
      name: "Project 1",
      rootPath: "C:/work",
      status: "active",
      tags: [],
      modelProfile: "default",
      memoryNamespace: "default",
      orchestrationProfile: "default",
      trustProfile: "trusted",
      createdAt: now,
      lastOpenedAt: now,
      lastActivityAt: now,
    });

    sessionRepo.save({
      id: "ses_01",
      projectId: "prj_01",
      name: "Session 1",
      branch: "main",
      status: "active",
      modelProfile: "default",
      keyPoolProfile: "default",
      mode: "interactive",
      permissions: {},
      createdAt: now,
      updatedAt: now,
    });

    repository = new ArtifactRepository(engine);
    manager = new ArtifactManager(repository, join(tempDir, "storage"));
  });

  afterEach(() => {
    engine.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes artifact atomically, computes SHA-256, and persists metadata in SQLite", async () => {
    const payload = JSON.stringify({ planTitle: "Refactor Auth Subsystem", steps: 5 });
    const artifact = await manager.createArtifact({
      type: "plan",
      data: payload,
      projectId: "prj_01",
      sessionId: "ses_01",
      agentId: "agent_architect",
      filename: "auth_plan.json",
    });

    expect(artifact.id).toBeDefined();
    expect(artifact.type).toBe("plan");
    expect(artifact.projectId).toBe("prj_01");
    expect(artifact.sha256).toHaveLength(64);
    expect(artifact.contentUri).toContain("auth_plan.json");

    // Read back and verify content matches exactly
    const readResult = await manager.readArtifact(artifact.id);
    expect(readResult.artifact.id).toBe(artifact.id);
    expect(readResult.data.toString("utf8")).toBe(payload);
  });

  it("retrieves artifact across new repository instances using SQLite storage", async () => {
    const payload = "Build report: ALL_TESTS_PASSED";
    const created = await manager.createArtifact({
      type: "build-report",
      data: payload,
      projectId: "prj_01",
    });

    // Reconstruct manager with same repository and storage
    const newRepo = new ArtifactRepository(engine);
    const newManager = new ArtifactManager(newRepo, join(tempDir, "storage"));

    const retrieved = await newManager.readArtifact(created.id);
    expect(retrieved.artifact.id).toBe(created.id);
    expect(retrieved.data.toString("utf8")).toBe(payload);
  });
});
