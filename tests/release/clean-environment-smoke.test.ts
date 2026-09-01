import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";

describe("P9.6 Release Engineering — Clean-Environment Installation & Runtime Smoke Test", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it("installs packaged tarball in isolated directory and executes CLI smoke verification", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "anantham-clean-install-"));
    const releaseDir = path.join(process.cwd(), "dist", "release");
    const manifest = JSON.parse(fs.readFileSync(path.join(releaseDir, "release-manifest.json"), "utf8"));
    const tarballPath = path.join(releaseDir, manifest.filename);

    // Unpack tarball in clean directory (tar -xzf)
    execSync(`tar -xzf "${tarballPath}" -C "${tmpDir}"`, { encoding: "utf8" });

    const packageRoot = path.join(tmpDir, "package");
    expect(fs.existsSync(packageRoot)).toBe(true);
    expect(fs.existsSync(path.join(packageRoot, "dist", "index.js"))).toBe(true);
    expect(fs.existsSync(path.join(packageRoot, "dist", "bin", "anantham.js"))).toBe(true);
    expect(fs.existsSync(path.join(packageRoot, "LICENSE"))).toBe(true);
    expect(fs.existsSync(path.join(packageRoot, "README.md"))).toBe(true);

    // Verify bin executable runs without error (--help / --version)
    const binPath = path.join(packageRoot, "dist", "bin", "anantham.js");
    const helpOutput = execSync(`node "${binPath}" --help`, { encoding: "utf8" });
    expect(helpOutput).toContain("Anantham V2");

    const versionOutput = execSync(`node "${binPath}" --version`, { encoding: "utf8" });
    expect(versionOutput.trim()).toBe("2.0.0-alpha.1");
  });

  it("verifies clean SQLite engine and migration initialization from packaged artifacts", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "anantham-db-smoke-"));
    const releaseDir = path.join(process.cwd(), "dist", "release");
    const manifest = JSON.parse(fs.readFileSync(path.join(releaseDir, "release-manifest.json"), "utf8"));
    const tarballPath = path.join(releaseDir, manifest.filename);

    execSync(`tar -xzf "${tarballPath}" -C "${tmpDir}"`, { encoding: "utf8" });
    const packageRoot = path.join(tmpDir, "package");

    // Dynamic import of packaged entrypoint
    const distModule = await import(path.join(packageRoot, "dist", "index.js"));
    expect(distModule.SqliteEngine).toBeDefined();
    expect(distModule.MigrationEngine).toBeDefined();

    // Initialize standalone SQLite database in clean temp directory
    const dbPath = path.join(tmpDir, "smoke.db");
    const engine = new distModule.SqliteEngine({ path: dbPath });
    engine.open();

    const migrator = new distModule.MigrationEngine(engine);
    const result = migrator.migrate();
    expect(result.appliedCount).toBeGreaterThan(0);
    expect(result.currentVersion).toBeGreaterThan(0);

    const integrity = engine.raw.prepare("PRAGMA integrity_check;").get() as { integrity_check: string };
    expect(integrity.integrity_check).toBe("ok");

    engine.close();
  });
});
