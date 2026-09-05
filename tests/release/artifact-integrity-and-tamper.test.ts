import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ReleaseEngineeringEngine } from "../../scripts/release-engineering.mjs";

describe("P9.6 Release Engineering — Artifact Integrity & Tamper Detection", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it("verifies package release generation, valid SHA-256 digests, and manifest consistency", () => {
    const result = ReleaseEngineeringEngine.packageRelease();

    expect(result.manifest.name).toBe("anantham-v2");
    expect(result.manifest.version).toBeDefined();
    expect(result.manifest.sha256).toBeDefined();
    expect(result.manifest.sha256.length).toBe(64);
    expect(result.manifest.sha512).toBeDefined();
    expect(result.manifest.sha512.length).toBe(128);

    const releaseDir = path.join(process.cwd(), "dist", "release");
    const tarballPath = path.join(releaseDir, result.manifest.filename);
    const manifestPath = path.join(releaseDir, "release-manifest.json");

    const check = ReleaseEngineeringEngine.verifyArtifactIntegrity(manifestPath, tarballPath);
    expect(check.isValid).toBe(true);
    expect(check.sha256).toBe(result.manifest.sha256);
  });

  it("detects single-byte tampering of release tarball deterministically", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "anantham-tamper-test-"));
    const releaseDir = path.join(process.cwd(), "dist", "release");
    const manifestPath = path.join(releaseDir, "release-manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

    const originalTarball = path.join(releaseDir, manifest.filename);
    const tamperedTarball = path.join(tmpDir, manifest.filename);
    const tempManifest = path.join(tmpDir, "release-manifest.json");

    // Copy original tarball and manifest
    fs.copyFileSync(originalTarball, tamperedTarball);
    fs.copyFileSync(manifestPath, tempManifest);

    // Tamper single byte in the tarball
    const bytes = fs.readFileSync(tamperedTarball);
    bytes[10] = (bytes[10] + 1) % 256; // Flip 1 byte
    fs.writeFileSync(tamperedTarball, bytes);

    // Verify tamper detection
    const check = ReleaseEngineeringEngine.verifyArtifactIntegrity(tempManifest, tamperedTarball);
    expect(check.isValid).toBe(false);
    expect(check.error).toContain("Cryptographic SHA-256 mismatch");
  });

  it("detects manifest alteration deterministically", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "anantham-manifest-tamper-"));
    const releaseDir = path.join(process.cwd(), "dist", "release");
    const manifestPath = path.join(releaseDir, "release-manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

    const tarballPath = path.join(releaseDir, manifest.filename);
    const tempManifest = path.join(tmpDir, "release-manifest.json");

    // Alter manifest SHA-256
    const alteredManifest = {
      ...manifest,
      sha256: "0000000000000000000000000000000000000000000000000000000000000000",
    };
    fs.writeFileSync(tempManifest, JSON.stringify(alteredManifest, null, 2));

    const check = ReleaseEngineeringEngine.verifyArtifactIntegrity(tempManifest, tarballPath);
    expect(check.isValid).toBe(false);
    expect(check.error).toContain("Cryptographic SHA-256 mismatch");
  });
});
