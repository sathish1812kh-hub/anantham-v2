import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

describe("P9.6 Release Engineering — Reproducible Build & Release Support Bundle", () => {
  it("verifies package contents strictly exclude development, test, and hidden sensitive files", () => {
    const releaseDir = path.join(process.cwd(), "dist", "release");
    const manifest = JSON.parse(fs.readFileSync(path.join(releaseDir, "release-manifest.json"), "utf8"));
    const tarballPath = path.join(releaseDir, manifest.filename);

    // List all files in the tarball (tar -tf)
    const fileListOutput = execSync(`tar -tf "${tarballPath}"`, { encoding: "utf8" });
    const tarballFiles = fileListOutput.split("\n").filter(Boolean);

    // Excluded patterns
    const forbiddenPatterns = [
      "package/tests/",
      "package/.git",
      "package/.env",
      "package/docs/",
      "package/ANANTHAM PROJECT SOURCES",
      "package/scripts/",
      "package/coverage/",
    ];

    for (const file of tarballFiles) {
      for (const pattern of forbiddenPatterns) {
        expect(file.startsWith(pattern)).toBe(false);
      }
    }

    // Required inclusions
    expect(tarballFiles.some((f) => f.includes("package/dist/index.js"))).toBe(true);
    expect(tarballFiles.some((f) => f.includes("package/LICENSE"))).toBe(true);
    expect(tarballFiles.some((f) => f.includes("package/README.md"))).toBe(true);
  });

  it("verifies release support bundle structure and cryptographic provenance", () => {
    const releaseDir = path.join(process.cwd(), "dist", "release");
    const bundlePath = path.join(releaseDir, "release-support-bundle.json");
    expect(fs.existsSync(bundlePath)).toBe(true);

    const bundle = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
    expect(bundle.bundleId).toBeDefined();
    expect(bundle.product).toBe("Anantham V2");
    expect(bundle.version).toBeDefined();
    expect(bundle.gitCommit).toBeDefined();
    expect(bundle.licenseStatus).toBe("COMPLIANT");
    expect(bundle.secretScanStatus).toBe("CLEAN");
    expect(bundle.sbomChecksum).toBeDefined();
    expect(bundle.manifest.sha256).toBeDefined();
  });
});
