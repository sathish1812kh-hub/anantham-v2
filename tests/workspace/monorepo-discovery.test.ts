import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { MonorepoDiscoveryEngine } from "../../src/workspace/monorepo-discovery.js";

describe("F-REL-14: Monorepo & Multi-Root Workspace Discovery", () => {
  const testDir = join(process.cwd(), ".test_monorepo_disc_" + Date.now());
  const engine = new MonorepoDiscoveryEngine();

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("discovers pnpm workspace packages and computes topological build order", () => {
    writeFileSync(join(testDir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");

    const coreDir = join(testDir, "packages", "core");
    const uiDir = join(testDir, "packages", "ui");
    const appDir = join(testDir, "packages", "app");
    mkdirSync(coreDir, { recursive: true });
    mkdirSync(uiDir, { recursive: true });
    mkdirSync(appDir, { recursive: true });

    // core has no internal dependencies
    writeFileSync(join(coreDir, "package.json"), JSON.stringify({ name: "@mono/core", version: "1.0.0" }));

    // ui depends on core
    writeFileSync(
      join(uiDir, "package.json"),
      JSON.stringify({
        name: "@mono/ui",
        version: "1.0.0",
        dependencies: { "@mono/core": "1.0.0" },
      })
    );

    // app depends on both core and ui
    writeFileSync(
      join(appDir, "package.json"),
      JSON.stringify({
        name: "@mono/app",
        version: "1.0.0",
        dependencies: { "@mono/core": "1.0.0", "@mono/ui": "1.0.0" },
      })
    );

    const info = engine.discover(testDir);
    expect(info.isMonorepo).toBe(true);
    expect(info.tool).toBe("pnpm");
    expect(info.packages.length).toBe(3);

    // Topological order must place dependencies before dependents: core -> ui -> app
    const coreIdx = info.buildOrder.indexOf("@mono/core");
    const uiIdx = info.buildOrder.indexOf("@mono/ui");
    const appIdx = info.buildOrder.indexOf("@mono/app");

    expect(coreIdx).toBeLessThan(uiIdx);
    expect(uiIdx).toBeLessThan(appIdx);
  });

  it("discovers Cargo workspace with multiple crates", () => {
    writeFileSync(
      join(testDir, "Cargo.toml"),
      `[workspace]
members = [
    "crates/core",
    "crates/cli"
]
`
    );

    const coreCrate = join(testDir, "crates", "core");
    const cliCrate = join(testDir, "crates", "cli");
    mkdirSync(coreCrate, { recursive: true });
    mkdirSync(cliCrate, { recursive: true });

    writeFileSync(join(coreCrate, "Cargo.toml"), '[package]\nname = "my-core"\nversion = "0.1.0"');
    writeFileSync(join(cliCrate, "Cargo.toml"), '[package]\nname = "my-cli"\nversion = "0.1.0"');

    const info = engine.discover(testDir);
    expect(info.isMonorepo).toBe(true);
    expect(info.tool).toBe("cargo");
    expect(info.packages.length).toBe(2);
    expect(info.packages.map((p) => p.name)).toContain("my-core");
    expect(info.packages.map((p) => p.name)).toContain("my-cli");
  });

  it("discovers Gradle multi-project from settings.gradle", () => {
    writeFileSync(
      join(testDir, "settings.gradle"),
      `rootProject.name = 'my-gradle-monorepo'
include 'services:auth'
include 'services:gateway'
`
    );

    const authDir = join(testDir, "services", "auth");
    const gwDir = join(testDir, "services", "gateway");
    mkdirSync(authDir, { recursive: true });
    mkdirSync(gwDir, { recursive: true });
    writeFileSync(join(authDir, "build.gradle"), "// auth module");
    writeFileSync(join(gwDir, "build.gradle"), "// gateway module");

    const info = engine.discover(testDir);
    expect(info.isMonorepo).toBe(true);
    expect(info.tool).toBe("gradle");
    expect(info.packages.length).toBe(2);
  });

  it("returns isMonorepo = false for non-monorepo directories", () => {
    const emptyDir = join(testDir, "regular_app");
    mkdirSync(emptyDir, { recursive: true });
    writeFileSync(join(emptyDir, "package.json"), JSON.stringify({ name: "single-app" }));

    const info = engine.discover(emptyDir);
    expect(info.isMonorepo).toBe(false);
    expect(info.tool).toBe("none");
  });
});
