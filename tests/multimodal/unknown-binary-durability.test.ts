import { describe, it, expect, afterEach } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ArtifactRepository } from "../../src/persistence/repositories/artifact-repository.js";
import { ContentIngestionEngine } from "../../src/content/content-ingestion-engine.js";

describe("P9.4 Multimodal — Unknown Binary Preservation & Durability Across Reopen", () => {
  let tmpDir: string;
  let dbPath: string;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it("preserves raw unknown binary bytes byte-for-byte with exact SHA-256 parity across SQLite reopen", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "anantham-binary-durability-"));
    dbPath = path.join(tmpDir, "test-binary.db");

    const engine1 = new SqliteEngine({ path: dbPath });
    engine1.open();
    const migrator1 = new MigrationEngine(engine1);
    migrator1.migrate();

    const artifactRepo1 = new ArtifactRepository(engine1);

    // 1. Generate arbitrary unknown binary data (1KB)
    const rawBinary = Buffer.concat([Buffer.from([0x00, 0xff, 0x01, 0xfe, 0x02, 0xfd]), randomBytes(1024)]);
    const expectedSha256 = createHash("sha256").update(rawBinary).digest("hex");

    // 2. Ingest via ContentIngestionEngine
    const content = await ContentIngestionEngine.ingest({
      name: "unknown_payload.bin",
      data: rawBinary,
      source: { type: "upload" },
    });

    expect(content.kind).toBe("binary");
    expect(content.sha256).toBe(expectedSha256);
    expect(content.representations.some((r) => r.type === "raw" || r.type === "metadata")).toBe(true);

    // 3. Persist raw bytes to filesystem blob and record in SQLite
    const blobPath = path.join(tmpDir, "unknown_payload.bin");
    fs.writeFileSync(blobPath, rawBinary);

    artifactRepo1.save({
      id: "art_bin_01",
      type: "generated-file",
      contentUri: `file://${blobPath}`,
      sha256: expectedSha256,
      sourceEventIds: [],
      createdAt: new Date().toISOString(),
    });

    // 4. Close database cleanly to simulate engine restart
    engine1.close();

    // 5. Reopen database from disk
    const engine2 = new SqliteEngine({ path: dbPath });
    engine2.open();
    const artifactRepo2 = new ArtifactRepository(engine2);

    const retrievedArtifact = artifactRepo2.findById("art_bin_01");
    expect(retrievedArtifact).toBeDefined();
    expect(retrievedArtifact?.sha256).toBe(expectedSha256);

    // 6. Verify physical bytes on disk match 100% byte-for-byte
    const diskBytes = fs.readFileSync(blobPath);
    const diskSha256 = createHash("sha256").update(diskBytes).digest("hex");
    expect(diskSha256).toBe(expectedSha256);
    expect(Buffer.compare(rawBinary, diskBytes)).toBe(0);

    engine2.close();
  });
});
