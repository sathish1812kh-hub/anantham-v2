import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { CheckpointRepository } from "../../src/persistence/repositories/checkpoint-repository.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { ArtifactRepository } from "../../src/persistence/repositories/artifact-repository.js";
import { EventRepository } from "../../src/persistence/repositories/event-repository.js";
import { CheckpointManifestBuilder } from "../../src/recovery/checkpoint-manifest.js";
import { CheckpointValidator } from "../../src/recovery/checkpoint-validator.js";

describe("Recovery Subsystem — Checkpoint Manifest & Validation", () => {
  let tmpDir: string;
  let dbPath: string;
  let engine: SqliteEngine;
  let checkpointRepo: CheckpointRepository;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let artifactRepo: ArtifactRepository;
  let eventRepo: EventRepository;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "anantham-chk-test-"));
    dbPath = join(tmpDir, "checkpoint-test.db");
    engine = new SqliteEngine({ path: dbPath });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    checkpointRepo = new CheckpointRepository(engine);
    projectRepo = new ProjectRepository(engine);
    sessionRepo = new SessionRepository(engine);
    artifactRepo = new ArtifactRepository(engine);
    eventRepo = new EventRepository(engine);

    // Seed project & session
    projectRepo.save({
      id: "proj_chk_01",
      name: "Checkpoint Test Project",
      rootPath: "/tmp/proj",
      status: "active",
      tags: ["testing"],
      modelProfile: "claude-3-5-sonnet",
      memoryNamespace: "project/proj_chk_01",
      orchestrationProfile: "default",
      trustProfile: "developer",
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    });

    sessionRepo.save({
      id: "sess_chk_01",
      projectId: "proj_chk_01",
      name: "Checkpoint Test Session",
      branch: "main",
      status: "active",
      modelProfile: "claude-3-5-sonnet",
      keyPoolProfile: "default",
      mode: "interactive",
      permissions: { "filesystem:read": true },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  afterEach(() => {
    engine.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates a cryptographically signed checkpoint and validates its integrity", () => {
    const checkpoint = CheckpointManifestBuilder.createCheckpoint({
      projectId: "proj_chk_01",
      sessionId: "sess_chk_01",
      type: "automatic",
      eventOffset: 42,
      taskStateSummary: { tsk_1: "COMPLETED", tsk_2: "IN_PROGRESS" },
      artifactHashes: { art_1: "a".repeat(64) },
    });

    expect(checkpoint.id).toBeDefined();
    expect(checkpoint.sha256).toHaveLength(64);
    expect(checkpoint.validationChecksum).toHaveLength(64);

    const integrity = CheckpointValidator.validateIntegrity(checkpoint);
    expect(integrity.isValid).toBe(true);
    expect(integrity.errors).toHaveLength(0);
  });

  it("detects tampering when checkpoint manifest or checksum is modified", () => {
    const checkpoint = CheckpointManifestBuilder.createCheckpoint({
      projectId: "proj_chk_01",
      sessionId: "sess_chk_01",
      type: "pre-compaction",
      eventOffset: 10,
    });

    // Tamper with manifest
    const tampered = {
      ...checkpoint,
      manifest: {
        ...checkpoint.manifest,
        eventOffset: 999, // Tampered offset
      },
    };

    const integrity = CheckpointValidator.validateIntegrity(tampered);
    expect(integrity.isValid).toBe(false);
    expect(integrity.errors.some((e) => e.includes("Manifest SHA-256 mismatch"))).toBe(true);
  });

  it("persists checkpoint and validates against real artifacts in repository", async () => {
    // Save real artifact
    const artifactSha = "b".repeat(64);
    artifactRepo.save({
      id: "art_valid_01",
      projectId: "proj_chk_01",
      sessionId: "sess_chk_01",
      type: "generated-file",
      contentUri: "file:///data/output.json",
      sha256: artifactSha,
      sourceEventIds: [],
      createdAt: new Date().toISOString(),
    });

    const checkpoint = CheckpointManifestBuilder.createCheckpoint({
      projectId: "proj_chk_01",
      sessionId: "sess_chk_01",
      type: "post-verification",
      eventOffset: 0,
      artifactHashes: {
        art_valid_01: artifactSha,
      },
    });

    checkpointRepo.save(checkpoint);
    const loaded = checkpointRepo.findById(checkpoint.id);
    expect(loaded).not.toBeNull();

    const fullValidation = await CheckpointValidator.validateComplete(loaded!, {
      artifactRepo,
      eventRepo,
    });

    expect(fullValidation.isValid).toBe(true);
    expect(fullValidation.artifactsValid).toBe(true);
    expect(fullValidation.missingArtifactIds).toHaveLength(0);
  });

  it("flags missing or mismatched artifacts during complete validation", async () => {
    const checkpoint = CheckpointManifestBuilder.createCheckpoint({
      projectId: "proj_chk_01",
      sessionId: "sess_chk_01",
      type: "task-completion",
      eventOffset: 0,
      artifactHashes: {
        non_existent_art: "c".repeat(64),
      },
    });

    const validation = await CheckpointValidator.validateComplete(checkpoint, {
      artifactRepo,
      eventRepo,
    });

    expect(validation.isValid).toBe(false);
    expect(validation.artifactsValid).toBe(false);
    expect(validation.missingArtifactIds).toContain("non_existent_art");
  });
});
