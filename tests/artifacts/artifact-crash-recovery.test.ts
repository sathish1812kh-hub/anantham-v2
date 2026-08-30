import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ArtifactRepository } from "../../src/persistence/repositories/artifact-repository.js";
import { ArtifactManager } from "../../src/artifacts/artifact-manager.js";

describe("ArtifactManager - Crash Safety & Orphan Temp File Cleanup", () => {
  let tempDir: string;
  let engine: SqliteEngine;
  let repository: ArtifactRepository;
  let manager: ArtifactManager;
  let storageDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "anantham-artifact-crash-"));
    storageDir = join(tempDir, "storage");
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    new MigrationEngine(engine).migrate();
    repository = new ArtifactRepository(engine);
    manager = new ArtifactManager(repository, storageDir);
  });

  afterEach(() => {
    engine.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("detects and sweeps orphan .tmp files left by simulated process crashes", async () => {
    // Simulate leftover .tmp files from interrupted writes
    writeFileSync(join(storageDir, "artifact_1.dat.uuid1.tmp"), "Interrupted write 1");
    writeFileSync(join(storageDir, "artifact_2.dat.uuid2.tmp"), "Interrupted write 2");

    // Also write a real completed artifact
    await manager.createArtifact({
      type: "log",
      data: "Completed artifact",
      filename: "valid_log.txt",
    });

    const cleanedCount = await manager.cleanupOrphanTempFiles();
    expect(cleanedCount).toBe(2);

    const remainingFiles = readdirSync(storageDir);
    expect(remainingFiles.some(f => f.endsWith(".tmp"))).toBe(false);
    expect(remainingFiles.some(f => f.includes("valid_log"))).toBe(true);
  });
});
