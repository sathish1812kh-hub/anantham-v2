import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ArtifactRepository } from "../../src/persistence/repositories/artifact-repository.js";
import { ArtifactManager } from "../../src/artifacts/artifact-manager.js";

describe("ArtifactManager - Verification Status Lifecycle", () => {
  let tempDir: string;
  let engine: SqliteEngine;
  let repository: ArtifactRepository;
  let manager: ArtifactManager;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "anantham-artifact-verify-"));
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

  it("transitions artifact from unverified to verified upon deterministic check", async () => {
    const artifact = await manager.createArtifact({
      type: "diagram",
      data: "graph TD; A-->B;",
      filename: "flow.mmd",
    });

    expect(artifact.verification?.status).toBe("unverified");

    const verified = await manager.verifyArtifact(artifact.id, "auditor_agent");
    expect(verified.verification?.status).toBe("verified");
    expect(verified.verification?.checks).toContain("sha256-verified");
    expect(verified.verification?.verifierId).toBe("auditor_agent");
  });

  it("marks artifact verification status as failed if physical file is missing or tampered", async () => {
    const artifact = await manager.createArtifact({
      type: "log",
      data: "Execution log content",
    });

    // Delete the file
    const filePath = artifact.contentUri.replace(/^file:\/\/\/?/, "");
    unlinkSync(filePath);

    const result = await manager.verifyArtifact(artifact.id);
    expect(result.verification?.status).toBe("failed");
    expect(result.verification?.checks).toContain("file-missing");
  });
});
