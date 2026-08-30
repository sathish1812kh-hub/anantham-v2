import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ArtifactRepository } from "../../src/persistence/repositories/artifact-repository.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { ArtifactManager, ArtifactAccessDeniedError } from "../../src/artifacts/artifact-manager.js";
import { ArtifactReferenceValidator } from "../../src/artifacts/artifact-reference-validator.js";

describe("ArtifactManager - Security & Cross-Project Boundary Isolation", () => {
  let tempDir: string;
  let engine: SqliteEngine;
  let repository: ArtifactRepository;
  let manager: ArtifactManager;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "anantham-artifact-sec-"));
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    new MigrationEngine(engine).migrate();

    const now = new Date().toISOString();
    const projectRepo = new ProjectRepository(engine);
    projectRepo.save({
      id: "prj_alpha",
      name: "Project Alpha",
      rootPath: "C:/alpha",
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

    projectRepo.save({
      id: "prj_beta",
      name: "Project Beta",
      rootPath: "C:/beta",
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

    repository = new ArtifactRepository(engine);
    manager = new ArtifactManager(repository, join(tempDir, "storage"));
  });

  afterEach(() => {
    engine.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("prevents directory traversal escaping the artifact storage directory", () => {
    const base = join(tempDir, "storage");
    const traversalPath = join(base, "../../etc/passwd");
    const result = ArtifactReferenceValidator.validateStoragePath(traversalPath, base);

    expect(result.isValid).toBe(false);
    expect(result.reason).toContain("Path traversal detected");
  });

  it("enforces cross-project isolation and rejects unauthorized access", async () => {
    const artifact = await manager.createArtifact({
      type: "research-report",
      data: "Confidential Project Alpha Research",
      projectId: "prj_alpha",
    });

    // Allowed: access from same project
    const sameProjectRead = await manager.readArtifact(artifact.id, {
      requestProjectId: "prj_alpha",
    });
    expect(sameProjectRead.artifact.id).toBe(artifact.id);

    // Rejected: access from different project
    await expect(
      manager.readArtifact(artifact.id, {
        requestProjectId: "prj_beta",
      })
    ).rejects.toThrow(ArtifactAccessDeniedError);
  });
});
