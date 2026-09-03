import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { MonorepoDiscoveryEngine } from "../../src/workspace/monorepo-discovery.js";

describe("Adversarial Stress Suite: Monorepo Discovery & Topological Sorting Robustness", () => {
  const testDir = join(process.cwd(), ".test_adv_monorepo_" + Date.now());
  const engine = new MonorepoDiscoveryEngine();

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("1. Cyclic Dependencies & Kahn's Algorithm Infinite-Loop Protection", () => {
    it("resolves self-referencing cyclic dependency (A -> A) without infinite loop and includes all packages", () => {
      // pnpm-workspace with package-a depending on package-a
      writeFileSync(join(testDir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");
      const pkgADir = join(testDir, "packages", "pkg-a");
      mkdirSync(pkgADir, { recursive: true });
      writeFileSync(
        join(pkgADir, "package.json"),
        JSON.stringify({
          name: "@scope/pkg-a",
          version: "1.0.0",
          dependencies: { "@scope/pkg-a": "workspace:*" },
        })
      );

      const res = engine.discover(testDir);
      expect(res.isMonorepo).toBe(true);
      expect(res.tool).toBe("pnpm");
      expect(res.packages.length).toBe(1);
      expect(res.buildOrder).toEqual(["@scope/pkg-a"]);
    });

    it("resolves 2-node mutual cyclic dependency (A -> B, B -> A) gracefully with full package coverage", () => {
      writeFileSync(join(testDir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");

      const pkgADir = join(testDir, "packages", "pkg-a");
      const pkgBDir = join(testDir, "packages", "pkg-b");
      mkdirSync(pkgADir, { recursive: true });
      mkdirSync(pkgBDir, { recursive: true });

      writeFileSync(
        join(pkgADir, "package.json"),
        JSON.stringify({
          name: "@scope/pkg-a",
          dependencies: { "@scope/pkg-b": "workspace:*" },
        })
      );
      writeFileSync(
        join(pkgBDir, "package.json"),
        JSON.stringify({
          name: "@scope/pkg-b",
          dependencies: { "@scope/pkg-a": "workspace:*" },
        })
      );

      const res = engine.discover(testDir);
      expect(res.isMonorepo).toBe(true);
      expect(res.packages.length).toBe(2);
      expect(res.buildOrder.length).toBe(2);
      expect(res.buildOrder).toContain("@scope/pkg-a");
      expect(res.buildOrder).toContain("@scope/pkg-b");
    });

    it("resolves 3-node cyclic dependency ring (A -> B -> C -> A) plus independent DAG nodes", () => {
      writeFileSync(join(testDir, "package.json"), JSON.stringify({ workspaces: ["packages/*"] }));

      const pkgs = ["core", "ui", "api", "utils", "app"];
      for (const p of pkgs) {
        mkdirSync(join(testDir, "packages", p), { recursive: true });
      }

      // Cycle: ui -> api -> core -> ui
      writeFileSync(
        join(testDir, "packages", "ui", "package.json"),
        JSON.stringify({ name: "pkg-ui", dependencies: { "pkg-api": "*" } })
      );
      writeFileSync(
        join(testDir, "packages", "api", "package.json"),
        JSON.stringify({ name: "pkg-api", dependencies: { "pkg-core": "*" } })
      );
      writeFileSync(
        join(testDir, "packages", "core", "package.json"),
        JSON.stringify({ name: "pkg-core", dependencies: { "pkg-ui": "*" } })
      );

      // Independent DAG: utils (leaf) -> app (depends on utils)
      writeFileSync(
        join(testDir, "packages", "utils", "package.json"),
        JSON.stringify({ name: "pkg-utils", dependencies: {} })
      );
      writeFileSync(
        join(testDir, "packages", "app", "package.json"),
        JSON.stringify({ name: "pkg-app", dependencies: { "pkg-utils": "*" } })
      );

      const res = engine.discover(testDir);
      expect(res.isMonorepo).toBe(true);
      expect(res.packages.length).toBe(5);
      expect(res.buildOrder.length).toBe(5);

      // utils must be built before app in topological order
      const utilsIdx = res.buildOrder.indexOf("pkg-utils");
      const appIdx = res.buildOrder.indexOf("pkg-app");
      expect(utilsIdx).toBeLessThan(appIdx);

      // All cyclic nodes must still be present in buildOrder
      expect(res.buildOrder).toContain("pkg-ui");
      expect(res.buildOrder).toContain("pkg-api");
      expect(res.buildOrder).toContain("pkg-core");
    });
  });

  describe("2. Missing, Corrupted & Malformed Package Manifests", () => {
    it("handles subdirectories without any manifest files gracefully", () => {
      writeFileSync(join(testDir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");
      const emptyPkgDir = join(testDir, "packages", "no-manifest");
      const validPkgDir = join(testDir, "packages", "valid-pkg");
      mkdirSync(emptyPkgDir, { recursive: true });
      mkdirSync(validPkgDir, { recursive: true });

      writeFileSync(
        join(validPkgDir, "package.json"),
        JSON.stringify({ name: "valid-pkg", version: "1.0.0" })
      );

      const res = engine.discover(testDir);
      expect(res.packages.length).toBe(1);
      expect(res.packages[0]!.name).toBe("valid-pkg");
    });

    it("handles syntax-corrupted package.json in packages without crashing", () => {
      writeFileSync(join(testDir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");
      const brokenPkgDir = join(testDir, "packages", "broken");
      const validPkgDir = join(testDir, "packages", "valid");
      mkdirSync(brokenPkgDir, { recursive: true });
      mkdirSync(validPkgDir, { recursive: true });

      writeFileSync(join(brokenPkgDir, "package.json"), "{ invalid JSON content trailing...");
      writeFileSync(join(validPkgDir, "package.json"), JSON.stringify({ name: "valid" }));

      const res = engine.discover(testDir);
      expect(res.packages.length).toBe(1);
      expect(res.packages[0]!.name).toBe("valid");
    });

    it("handles package.json with null/primitive fields safely with fallbacks", () => {
      writeFileSync(join(testDir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");
      const weirdPkgDir = join(testDir, "packages", "weird-pkg");
      mkdirSync(weirdPkgDir, { recursive: true });

      writeFileSync(
        join(weirdPkgDir, "package.json"),
        JSON.stringify({
          name: null,
          dependencies: null,
          devDependencies: 12345,
        })
      );

      const res = engine.discover(testDir);
      expect(res.packages.length).toBe(1);
      // When name is null, it should fallback to folder name
      expect(res.packages[0]!.name).toBe("weird-pkg");
      expect(res.packages[0]!.dependencies).toEqual([]);
      expect(res.packages[0]!.devDependencies).toEqual([]);
    });
  });

  describe("3. Gradle & Bazel Multi-Project Edge Cases", () => {
    it("parses complex Gradle settings.gradle with colon notations, multi-lines, and comments", () => {
      const settingsContent = `
        rootProject.name = 'my-complex-gradle-app'
        // include ':ignored-commented-project'
        include ':services:auth'
        include ':services:billing', ':core:common'
        include ":apps:mobile"
      `;
      writeFileSync(join(testDir, "settings.gradle"), settingsContent);

      // Create directories with build.gradle
      const dirs = [
        join(testDir, "services", "auth"),
        join(testDir, "services", "billing"),
        join(testDir, "core", "common"),
        join(testDir, "apps", "mobile"),
      ];
      for (const d of dirs) {
        mkdirSync(d, { recursive: true });
        writeFileSync(join(d, "build.gradle"), "plugins { id 'java' }");
      }

      const res = engine.discover(testDir);
      expect(res.isMonorepo).toBe(true);
      expect(res.tool).toBe("gradle");
      expect(res.packages.length).toBe(4);
      const pkgNames = res.packages.map((p) => p.name);
      expect(pkgNames).toContain("auth");
      expect(pkgNames).toContain("billing");
      expect(pkgNames).toContain("common");
      expect(pkgNames).toContain("mobile");
    });

    it("parses Gradle Kotlin DSL settings.gradle.kts correctly", () => {
      const ktsContent = `
        rootProject.name = "kts-monorepo"
        include(":shared:domain", ":feature:login")
      `;
      writeFileSync(join(testDir, "settings.gradle.kts"), ktsContent);

      const domainDir = join(testDir, "shared", "domain");
      const loginDir = join(testDir, "feature", "login");
      mkdirSync(domainDir, { recursive: true });
      mkdirSync(loginDir, { recursive: true });
      writeFileSync(join(domainDir, "build.gradle.kts"), "");
      writeFileSync(join(loginDir, "build.gradle.kts"), "");

      const res = engine.discover(testDir);
      expect(res.isMonorepo).toBe(true);
      expect(res.tool).toBe("gradle");
      expect(res.packages.length).toBe(2);
    });

    it("parses Bazel WORKSPACE / MODULE.bazel multi-project layouts", () => {
      writeFileSync(join(testDir, "MODULE.bazel"), "module(name = 'bazel_monorepo')");

      const pkgADir = join(testDir, "packages", "bazel-a");
      const modBDir = join(testDir, "modules", "bazel-b");
      mkdirSync(pkgADir, { recursive: true });
      mkdirSync(modBDir, { recursive: true });
      writeFileSync(join(pkgADir, "package.json"), JSON.stringify({ name: "bazel-a" }));
      writeFileSync(join(modBDir, "package.json"), JSON.stringify({ name: "bazel-b" }));

      const res = engine.discover(testDir);
      expect(res.isMonorepo).toBe(true);
      expect(res.tool).toBe("bazel");
      expect(res.packages.length).toBe(2);
    });
  });

  describe("4. Tool Precedence & Multi-Workspace Isolation", () => {
    it("prioritizes pnpm-workspace.yaml over root package.json", () => {
      writeFileSync(join(testDir, "pnpm-workspace.yaml"), "packages:\n  - 'pnpm_pkgs/*'\n");
      writeFileSync(join(testDir, "package.json"), JSON.stringify({ workspaces: ["npm_pkgs/*"] }));

      const pnpmDir = join(testDir, "pnpm_pkgs", "pkg-pnpm");
      const npmDir = join(testDir, "npm_pkgs", "pkg-npm");
      mkdirSync(pnpmDir, { recursive: true });
      mkdirSync(npmDir, { recursive: true });
      writeFileSync(join(pnpmDir, "package.json"), JSON.stringify({ name: "pkg-pnpm" }));
      writeFileSync(join(npmDir, "package.json"), JSON.stringify({ name: "pkg-npm" }));

      const res = engine.discover(testDir);
      expect(res.tool).toBe("pnpm");
      expect(res.packages.length).toBe(1);
      expect(res.packages[0]!.name).toBe("pkg-pnpm");
    });
  });
});
