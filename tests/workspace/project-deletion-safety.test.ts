import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { ProjectDeletionSafetyManager } from "../../src/workspace/project-deletion-safety.js";

describe("PRD-PROJ-003: Project Remove Semantics & Deletion Safety", () => {
  const testDir = join(process.cwd(), ".test_deletion_safety_" + Date.now());
  const dbPath = join(testDir, "test.sqlite");
  let engine: SqliteEngine;
  let projectRepo: ProjectRepository;
  let deletionManager: ProjectDeletionSafetyManager;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    engine = new SqliteEngine({ path: dbPath });
    engine.open();
    new MigrationEngine(engine).migrate();

    projectRepo = new ProjectRepository(engine);
    deletionManager = new ProjectDeletionSafetyManager(engine);
  });

  afterEach(() => {
    if (engine.isOpen()) {
      engine.close();
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("tier 1 (REGISTRY_ONLY): deletes database entry but strictly preserves project source files and metadata", async () => {
    const sourceDir = join(testDir, "alpha_source");
    mkdirSync(sourceDir, { recursive: true });
    const sourceFile = join(sourceDir, "index.ts");
    writeFileSync(sourceFile, "export const app = 'alpha';");

    const now = new Date().toISOString();
    projectRepo.save({
      id: "prj_001",
      name: "Alpha",
      rootPath: sourceDir,
      status: "active",
      tags: [],
      modelProfile: "default",
      memoryNamespace: "mem",
      orchestrationProfile: "standard",
      trustProfile: "developer",
      createdAt: now,
      lastOpenedAt: now,
      lastActivityAt: now,
    });

    const result = await deletionManager.removeProject("prj_001", { tier: "REGISTRY_ONLY" });
    expect(result.registryDeleted).toBe(true);
    expect(result.sourceDeleted).toBe(false);

    // Database row deleted
    expect(projectRepo.findById("prj_001")).toBeNull();

    // Source files still intact on disk
    expect(existsSync(sourceFile)).toBe(true);
  });

  it("tier 2 (REGISTRY_AND_METADATA): purges metadata folder but strictly preserves project source files", async () => {
    const sourceDir = join(testDir, "beta_source");
    const metaDir = join(testDir, "beta_meta");
    mkdirSync(sourceDir, { recursive: true });
    mkdirSync(metaDir, { recursive: true });
    const sourceFile = join(sourceDir, "app.py");
    writeFileSync(sourceFile, "print('hello')");

    const now = new Date().toISOString();
    projectRepo.save({
      id: "prj_002",
      name: "Beta",
      rootPath: sourceDir,
      status: "active",
      tags: [],
      modelProfile: "default",
      memoryNamespace: "mem",
      orchestrationProfile: "standard",
      trustProfile: "developer",
      createdAt: now,
      lastOpenedAt: now,
      lastActivityAt: now,
    });

    const result = await deletionManager.removeProject("prj_002", {
      tier: "REGISTRY_AND_METADATA",
      metadataPath: metaDir,
    });

    expect(result.registryDeleted).toBe(true);
    expect(result.metadataDeleted).toBe(true);
    expect(result.sourceDeleted).toBe(false);

    expect(existsSync(sourceFile)).toBe(true);
    expect(existsSync(metaDir)).toBe(false);
  });

  it("tier 3 (DESTRUCTIVE): aborts if confirmation token does not match project name or ID", async () => {
    const sourceDir = join(testDir, "gamma_source");
    mkdirSync(sourceDir, { recursive: true });

    const now = new Date().toISOString();
    projectRepo.save({
      id: "prj_003",
      name: "Gamma",
      rootPath: sourceDir,
      status: "active",
      tags: [],
      modelProfile: "default",
      memoryNamespace: "mem",
      orchestrationProfile: "standard",
      trustProfile: "developer",
      createdAt: now,
      lastOpenedAt: now,
      lastActivityAt: now,
    });

    await expect(
      deletionManager.removeProject("prj_003", {
        tier: "DESTRUCTIVE",
        confirmToken: "wrong_token",
      })
    ).rejects.toThrow("Safety Guard: Destructive deletion aborted");

    expect(existsSync(sourceDir)).toBe(true);
    expect(projectRepo.findById("prj_003")).toBeDefined();
  });

  it("tier 3 (DESTRUCTIVE): deletes source files when matching confirmation token is provided", async () => {
    const sourceDir = join(testDir, "delta_source");
    mkdirSync(sourceDir, { recursive: true });

    const now = new Date().toISOString();
    projectRepo.save({
      id: "prj_004",
      name: "Delta",
      rootPath: sourceDir,
      status: "active",
      tags: [],
      modelProfile: "default",
      memoryNamespace: "mem",
      orchestrationProfile: "standard",
      trustProfile: "developer",
      createdAt: now,
      lastOpenedAt: now,
      lastActivityAt: now,
    });

    const result = await deletionManager.removeProject("prj_004", {
      tier: "DESTRUCTIVE",
      confirmToken: "Delta",
    });

    expect(result.registryDeleted).toBe(true);
    expect(result.sourceDeleted).toBe(true);
    expect(existsSync(sourceDir)).toBe(false);
  });
});
