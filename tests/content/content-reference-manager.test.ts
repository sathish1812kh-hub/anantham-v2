import { describe, it, expect, afterAll } from "vitest";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ContentReferenceManager } from "../../src/content/content-reference-manager.js";

describe("P2.1 Content Subsystem — Content Reference Manager", () => {
  const testDir = join(tmpdir(), `anantham_blob_test_${Date.now()}`);

  afterAll(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("stores large binary payloads to disk and verifies cryptographic SHA-256 integrity", () => {
    const payload = Buffer.from("Large persistent content blob data for Anantham V2 testing.", "utf8");
    const descriptor = ContentReferenceManager.storeBlob(payload, testDir);

    expect(descriptor.uri).toContain("blob_");
    expect(descriptor.sizeBytes).toBe(payload.length);
    expect(descriptor.sha256).toHaveLength(64);

    // Read back and verify
    const readBuffer = ContentReferenceManager.readBlob(descriptor.uri, descriptor.sha256);
    expect(readBuffer.toString("utf8")).toBe(payload.toString("utf8"));
    expect(ContentReferenceManager.verifyBlob(descriptor.uri, descriptor.sha256)).toBe(true);
  });

  it("detects and rejects corrupted blobs with integrity failure", () => {
    const payload = Buffer.from("Original uncorrupted content.", "utf8");
    const descriptor = ContentReferenceManager.storeBlob(payload, testDir);

    // Intentionally corrupt disk file
    const rawPath = descriptor.uri.replace(/^file:\/\/\/?/, "");
    const filePath = /^[a-zA-Z]:/.test(rawPath) ? rawPath : `/${rawPath}`;
    writeFileSync(filePath, Buffer.from("Corrupted content data!", "utf8"));

    expect(() => ContentReferenceManager.readBlob(descriptor.uri, descriptor.sha256)).toThrow(
      /Content blob integrity failure/
    );
    expect(ContentReferenceManager.verifyBlob(descriptor.uri, descriptor.sha256)).toBe(false);
  });
});
