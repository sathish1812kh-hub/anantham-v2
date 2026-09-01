import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createHash } from "node:crypto";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ArtifactRepository } from "../../src/persistence/repositories/artifact-repository.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { CheckpointValidator } from "../../src/recovery/checkpoint-validator.js";
import { CheckpointManifestBuilder } from "../../src/recovery/checkpoint-manifest.js";
import { type Checkpoint } from "../../src/domain/checkpoint.js";

describe("P9.2 Recovery — Physical Disk Artifact Integrity Validation", () => {
  let engine: SqliteEngine;
  let artifactRepo: ArtifactRepository;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "anantham-disk-eval-"));
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    artifactRepo = new ArtifactRepository(engine);
    projectRepo = new ProjectRepository(engine);
    sessionRepo = new SessionRepository(engine);

    const now = new Date().toISOString();
    projectRepo.save({
      id: "proj_art_disk",
      name: "Disk Artifact Test Project",
      rootPath: tempDir,
      status: "active",
      tags: [],
      modelProfile: "default",
      memoryNamespace: "default",
      orchestrationProfile: "default",
      trustProfile: "safe",
      createdAt: now,
      lastOpenedAt: now,
      lastActivityAt: now,
    });

    sessionRepo.save({
      id: "sess_art_disk",
      projectId: "proj_art_disk",
      name: "Disk Artifact Session",
      branch: "main",
      status: "active",
      modelProfile: "default",
      keyPoolProfile: "default",
      mode: "interactive",
      permissions: {},
      createdAt: now,
      updatedAt: now,
    });
  });

  afterEach(() => {
    engine.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("detects when a physical artifact file on disk is deleted or modified", async () => {
    const filePath = path.join(tempDir, "output.txt");
    const content = "Hello physical disk verification!";
    fs.writeFileSync(filePath, content, "utf8");

    const hash = createHash("sha256").update(content).digest("hex");
    const now = new Date().toISOString();

    artifactRepo.save({
      id: "art_disk_01",
      projectId: "proj_art_disk",
      sessionId: "sess_art_disk",
      path: filePath,
      contentUri: `file://${filePath}`,
      sourceEventIds: [],
      sha256: hash,
      sizeBytes: Buffer.byteLength(content),
      mimeType: "text/plain",
      type: "file",
      createdAt: now,
      updatedAt: now,
    });


    const checkpoint = CheckpointManifestBuilder.createCheckpoint({
      id: "chk_disk_01",
      projectId: "proj_art_disk",
      sessionId: "sess_art_disk",
      type: "manual",
      eventOffset: 0,
      artifactHashes: {
        art_disk_01: hash,
      },
    });


    // 1. Initial validation with physical disk verification enabled
    const validRes = await CheckpointValidator.validateComplete(
      checkpoint,
      { artifactRepo },
      { verifyPhysicalDisk: true }
    );
    expect(validRes.isValid).toBe(true);
    expect(validRes.artifactsValid).toBe(true);

    // 2. Tamper scenario: Modify physical file on disk
    fs.writeFileSync(filePath, "TAMPERED CONTENT!", "utf8");
    const tamperedRes = await CheckpointValidator.validateComplete(
      checkpoint,
      { artifactRepo },
      { verifyPhysicalDisk: true }
    );
    expect(tamperedRes.isValid).toBe(false);
    expect(tamperedRes.artifactsValid).toBe(false);
    expect(tamperedRes.mismatchedArtifactIds).toContain("art_disk_01");

    // 3. Deletion scenario: Delete physical file on disk
    fs.unlinkSync(filePath);
    const deletedRes = await CheckpointValidator.validateComplete(
      checkpoint,
      { artifactRepo },
      { verifyPhysicalDisk: true }
    );
    expect(deletedRes.isValid).toBe(false);
    expect(deletedRes.artifactsValid).toBe(false);
    expect(deletedRes.missingArtifactIds).toContain("art_disk_01");
  });
});

