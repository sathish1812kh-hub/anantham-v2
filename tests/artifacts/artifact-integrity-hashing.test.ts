import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ArtifactRepository } from "../../src/persistence/repositories/artifact-repository.js";
import { ArtifactManager, ArtifactIntegrityError, ArtifactNotFoundError } from "../../src/artifacts/artifact-manager.js";

describe("ArtifactManager - Cryptographic Hashing & Integrity Verification", () => {
  let tempDir: string;
  let engine: SqliteEngine;
  let repository: ArtifactRepository;
  let manager: ArtifactManager;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "anantham-artifact-hash-"));
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    new MigrationEngine(engine).migrate();
    repository = new ArtifactRepository(engine);
    manager = new ArtifactManager(repository, join(tempDir, "storage"));
  });

  afterEach(() => {
    engine.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("detects disk file tampering and throws ArtifactIntegrityError on read", async () => {
    const originalContent = "Secure cryptographic payload";
    const artifact = await manager.createArtifact({
      type: "patch",
      data: originalContent,
      filename: "patch_01.diff",
    });

    // Directly tamper with the physical file on disk
    const filePath = artifact.contentUri.replace(/^file:\/\/\/?/, "");
    writeFileSync(filePath, "Maliciously modified payload!");

    // Expect read to detect SHA-256 mismatch
    await expect(manager.readArtifact(artifact.id)).rejects.toThrow(ArtifactIntegrityError);
  });

  it("throws ArtifactNotFoundError when reading non-existent artifact or missing physical file", async () => {
    await expect(manager.readArtifact("art_non_existent")).rejects.toThrow(ArtifactNotFoundError);
  });
});
