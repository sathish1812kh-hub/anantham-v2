import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { ProjectDeletionSafetyManager } from "../../src/workspace/project-deletion-safety.js";

describe("Adversarial Stress Suite: ProjectDeletionSafetyManager & SQLite Foreign Key Cascade Integrity", () => {
  const testDir = join(process.cwd(), ".test_adv_deletion_cascade_" + Date.now());
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

  describe("1. Token Validation & Tampering Defenses (Tier 3 DESTRUCTIVE)", () => {
    const projectId = "prj_adv_sec_001";
    const projectName = "SuperSecureProject";

    beforeEach(() => {
      const pDir = join(testDir, "sec_source");
      mkdirSync(pDir, { recursive: true });
      const now = new Date().toISOString();
      projectRepo.save({
        id: projectId,
        name: projectName,
        rootPath: pDir,
        status: "active",
        tags: ["security"],
        modelProfile: "default",
        memoryNamespace: "mem",
        orchestrationProfile: "standard",
        trustProfile: "developer",
        createdAt: now,
        lastOpenedAt: now,
        lastActivityAt: now,
      });
    });

    it("rejects undefined, empty, whitespace, and mismatched confirmation tokens", async () => {
      const invalidTokens = [
        undefined,
        "",
        "   ",
        "supersecureproject", // case mismatch
        "SUPERSECUREPROJECT", // upper case mismatch
        "SuperSecure",        // prefix substring
        "SecureProject",      // suffix substring
        "SuperSecureProject ", // trailing space
        " prj_adv_sec_001",   // leading space
        "prj_adv_sec",        // ID substring
        ".*",                 // regex injection
        "true",
        "null",
        "1",
      ];

      for (const token of invalidTokens) {
        await expect(
          deletionManager.removeProject(projectId, {
            tier: "DESTRUCTIVE",
            confirmToken: token as any,
          }),
          `Expected token "${token}" to be rejected`
        ).rejects.toThrow("Safety Guard: Destructive deletion aborted");

        // Verify project still exists in DB
        expect(projectRepo.findById(projectId)).not.toBeNull();
      }
    });

    it("accepts exact project name match for Tier 3 destructive removal", async () => {
      const pDir = join(testDir, "sec_source");
      const res = await deletionManager.removeProject(projectId, {
        tier: "DESTRUCTIVE",
        confirmToken: projectName,
      });

      expect(res.registryDeleted).toBe(true);
      expect(res.sourceDeleted).toBe(true);
      expect(projectRepo.findById(projectId)).toBeNull();
      expect(existsSync(pDir)).toBe(false);
    });

    it("accepts exact project ID match for Tier 3 destructive removal", async () => {
      const pDir2 = join(testDir, "sec_source_2");
      mkdirSync(pDir2, { recursive: true });
      const id2 = "prj_adv_sec_002";
      const now = new Date().toISOString();

      projectRepo.save({
        id: id2,
        name: "ProjectTwo",
        rootPath: pDir2,
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

      const res = await deletionManager.removeProject(id2, {
        tier: "DESTRUCTIVE",
        confirmToken: id2, // confirm with ID instead of name
      });

      expect(res.registryDeleted).toBe(true);
      expect(res.sourceDeleted).toBe(true);
      expect(projectRepo.findById(id2)).toBeNull();
      expect(existsSync(pDir2)).toBe(false);
    });
  });

  describe("2. Non-Existent Projects & Invalid Arguments", () => {
    it("throws a descriptive error when removing a non-existent project across all tiers", async () => {
      const tiers: Array<"REGISTRY_ONLY" | "REGISTRY_AND_METADATA" | "DESTRUCTIVE"> = [
        "REGISTRY_ONLY",
        "REGISTRY_AND_METADATA",
        "DESTRUCTIVE",
      ];

      for (const tier of tiers) {
        await expect(
          deletionManager.removeProject("nonexistent_id_404", {
            tier,
            confirmToken: "nonexistent_id_404",
          })
        ).rejects.toThrow("Project with ID nonexistent_id_404 not found");
      }
    });
  });

  describe("3. SQLite Referential Integrity & Foreign Key Cascade Behavior", () => {
    it("cascades deletion to sessions and tasks while preserving events immutability (SET NULL)", async () => {
      const pId = "prj_cascade_001";
      const sId = "ses_cascade_001";
      const tId = "tsk_cascade_001";
      const eId = "evt_cascade_001";
      const mId = "mem_cascade_001";
      const aId = "art_cascade_001";
      const now = new Date().toISOString();

      const pDir = join(testDir, "cascade_source");
      mkdirSync(pDir, { recursive: true });

      // 1. Insert Project
      projectRepo.save({
        id: pId,
        name: "CascadeProject",
        rootPath: pDir,
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

      // 2. Insert Session
      engine.raw.prepare(`
        INSERT INTO sessions (
          id, project_id, name, branch, status, model_profile,
          key_pool_profile, mode, permissions_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(sId, pId, "main_session", "main", "active", "default", "default", "standard", "{}", now, now);

      // 3. Insert Task
      engine.raw.prepare(`
        INSERT INTO tasks (
          id, project_id, session_id, objective, status, priority,
          dependencies_json, input_artifacts_json, output_artifacts_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(tId, pId, sId, "Build auth", "pending", "high", "[]", "[]", "[]", now, now);

      // 4. Insert Memory Item
      engine.raw.prepare(`
        INSERT INTO memory_items (
          id, scope, project_id, session_id, type, content, confidence,
          priority, source_event_ids_json, created_at, sensitivity
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(mId, "project", pId, sId, "fact", "Important project fact", 1.0, "high", "[]", now, "internal");

      // 5. Insert Authoritative Event (Should SET NULL, NOT delete)
      engine.raw.prepare(`
        INSERT INTO events (
          id, schema_version, project_id, session_id, task_id, type,
          actor, timestamp, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(eId, 1, pId, sId, tId, "TASK_CREATED", "user", now, "{}");

      // 6. Insert Artifact (Should SET NULL, NOT delete)
      engine.raw.prepare(`
        INSERT INTO artifacts (
          id, type, project_id, session_id, task_id, content_uri,
          sha256, source_event_ids_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(aId, "file", pId, sId, tId, "file:///alpha.ts", "hash123", "[]", now);

      // Pre-deletion checks: verify rows exist
      expect(engine.raw.prepare("SELECT count(*) as count FROM sessions WHERE id = ?").get(sId)).toEqual({ count: 1 });
      expect(engine.raw.prepare("SELECT count(*) as count FROM tasks WHERE id = ?").get(tId)).toEqual({ count: 1 });
      expect(engine.raw.prepare("SELECT count(*) as count FROM memory_items WHERE id = ?").get(mId)).toEqual({ count: 1 });
      expect(engine.raw.prepare("SELECT count(*) as count FROM events WHERE id = ?").get(eId)).toEqual({ count: 1 });

      // Execute Project Deletion via Manager (Tier 1: REGISTRY_ONLY)
      const delResult = await deletionManager.removeProject(pId, { tier: "REGISTRY_ONLY" });
      expect(delResult.registryDeleted).toBe(true);

      // Verify Project is removed
      expect(projectRepo.findById(pId)).toBeNull();

      // CASCADE VERIFICATION: Sessions, Tasks, and Memory items must be automatically removed
      expect(engine.raw.prepare("SELECT count(*) as count FROM sessions WHERE project_id = ?").get(pId)).toEqual({ count: 0 });
      expect(engine.raw.prepare("SELECT count(*) as count FROM tasks WHERE project_id = ?").get(pId)).toEqual({ count: 0 });
      expect(engine.raw.prepare("SELECT count(*) as count FROM memory_items WHERE project_id = ?").get(pId)).toEqual({ count: 0 });

      // IMMUTABILITY VERIFICATION: Authoritative events & artifacts MUST NOT be deleted, but project_id SET NULL
      const eventRow = engine.raw.prepare("SELECT * FROM events WHERE id = ?").get(eId) as any;
      expect(eventRow).toBeDefined();
      expect(eventRow.project_id).toBeNull(); // SET NULL preserved historical event
      expect(eventRow.type).toBe("TASK_CREATED");

      const artifactRow = engine.raw.prepare("SELECT * FROM artifacts WHERE id = ?").get(aId) as any;
      expect(artifactRow).toBeDefined();
      expect(artifactRow.project_id).toBeNull(); // SET NULL preserved artifact metadata

      // PRAGMA foreign_key_check must report 0 violations
      const fkCheck = engine.foreignKeyCheck();
      expect(fkCheck.ok).toBe(true);
      expect(fkCheck.violations.length).toBe(0);

      // PRAGMA integrity_check must report ok
      const integrity = engine.integrityCheck();
      expect(integrity.ok).toBe(true);
    });
  });

  describe("4. Filesystem Edge Cases & Resiliency", () => {
    it("handles already-missing metadata directories safely without crashing", async () => {
      const pId = "prj_adv_fs_001";
      const now = new Date().toISOString();
      const pDir = join(testDir, "fs_source");
      mkdirSync(pDir, { recursive: true });

      projectRepo.save({
        id: pId,
        name: "FsProject",
        rootPath: pDir,
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

      const nonExistentMetaDir = join(testDir, "non_existent_meta_folder");
      const res = await deletionManager.removeProject(pId, {
        tier: "REGISTRY_AND_METADATA",
        metadataPath: nonExistentMetaDir,
      });

      expect(res.registryDeleted).toBe(true);
      expect(res.metadataDeleted).toBe(false);
      expect(res.sourceDeleted).toBe(false);
      expect(existsSync(pDir)).toBe(true);
    });

    it("handles already-missing root directory safely during destructive removal", async () => {
      const pId = "prj_adv_fs_002";
      const now = new Date().toISOString();
      const nonExistentRootDir = join(testDir, "already_deleted_root");

      projectRepo.save({
        id: pId,
        name: "GhostProject",
        rootPath: nonExistentRootDir,
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

      const res = await deletionManager.removeProject(pId, {
        tier: "DESTRUCTIVE",
        confirmToken: "GhostProject",
      });

      expect(res.registryDeleted).toBe(true);
      expect(res.sourceDeleted).toBe(false);
      expect(projectRepo.findById(pId)).toBeNull();
    });
  });
});
