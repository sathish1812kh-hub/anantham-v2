/**
 * Monorepo & Multi-Root Workspace Discovery Engine
 * F-REL-14: Monorepo & Multi-Root Workspace Discovery
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export interface MonorepoPackage {
  name: string;
  version?: string;
  directory: string;
  manifestPath: string;
  dependencies: string[];
  devDependencies: string[];
  internalDependencies: string[];
}

export type MonorepoTool =
  | "pnpm"
  | "npm"
  | "yarn"
  | "lerna"
  | "nx"
  | "turborepo"
  | "cargo"
  | "gradle"
  | "bazel"
  | "none";

export interface MonorepoInfo {
  isMonorepo: boolean;
  tool: MonorepoTool;
  rootPath: string;
  packages: MonorepoPackage[];
  buildOrder: string[]; // Topological execution order
}

export class MonorepoDiscoveryEngine {
  public discover(workspaceRoot: string): MonorepoInfo {
    const root = resolve(workspaceRoot);

    // 1. Detect tool
    const pnpmWorkspace = join(root, "pnpm-workspace.yaml");
    const packageJson = join(root, "package.json");
    const lernaJson = join(root, "lerna.json");
    const nxJson = join(root, "nx.json");
    const turboJson = join(root, "turbo.json");
    const cargoToml = join(root, "Cargo.toml");
    const settingsGradle = join(root, "settings.gradle");
    const settingsGradleKts = join(root, "settings.gradle.kts");
    const bazelWorkspace = join(root, "WORKSPACE");
    const bazelWorkspaceExt = join(root, "WORKSPACE.bazel");
    const bazelModule = join(root, "MODULE.bazel");

    let tool: MonorepoTool = "none";
    let patterns: string[] = [];

    if (existsSync(pnpmWorkspace)) {
      tool = "pnpm";
      patterns = this.parsePnpmWorkspacePatterns(readFileSync(pnpmWorkspace, "utf-8"));
    } else if (existsSync(lernaJson)) {
      tool = "lerna";
      try {
        const lernaData = JSON.parse(readFileSync(lernaJson, "utf-8"));
        patterns = Array.isArray(lernaData.packages) ? lernaData.packages : ["packages/*"];
      } catch {
        patterns = ["packages/*"];
      }
    } else if (existsSync(turboJson)) {
      tool = "turborepo";
      patterns = ["packages/*", "apps/*"];
    } else if (existsSync(nxJson)) {
      tool = "nx";
      patterns = ["packages/*", "apps/*", "libs/*"];
    } else if (existsSync(packageJson)) {
      try {
        const pkg = JSON.parse(readFileSync(packageJson, "utf-8"));
        if (Array.isArray(pkg.workspaces)) {
          tool = "npm";
          patterns = pkg.workspaces;
        } else if (pkg.workspaces?.packages && Array.isArray(pkg.workspaces.packages)) {
          tool = "yarn";
          patterns = pkg.workspaces.packages;
        }
      } catch {
        // ignore
      }
    }

    if (tool === "none" && existsSync(cargoToml)) {
      try {
        const cargoContent = readFileSync(cargoToml, "utf-8");
        if (cargoContent.includes("[workspace]")) {
          tool = "cargo";
          patterns = this.parseCargoWorkspaceMembers(cargoContent);
        }
      } catch {}
    }

    if (tool === "none" && (existsSync(settingsGradle) || existsSync(settingsGradleKts))) {
      const gFile = existsSync(settingsGradleKts) ? settingsGradleKts : settingsGradle;
      try {
        const gContent = readFileSync(gFile, "utf-8");
        if (/include\s*\(?['":]/i.test(gContent)) {
          tool = "gradle";
          patterns = this.parseGradleIncludedProjects(gContent);
        }
      } catch {}
    }

    if (tool === "none" && (existsSync(bazelWorkspace) || existsSync(bazelWorkspaceExt) || existsSync(bazelModule))) {
      tool = "bazel";
      patterns = ["packages/*", "modules/*", "libs/*"];
    }

    if (tool === "none" || patterns.length === 0) {
      return {
        isMonorepo: false,
        tool: "none",
        rootPath: root,
        packages: [],
        buildOrder: [],
      };
    }

    // 2. Discover package manifests matching patterns
    const packages = this.findPackages(root, patterns, tool);

    // 3. Resolve internal dependency graph
    const packageNames = new Set(packages.map((p) => p.name));
    for (const pkg of packages) {
      pkg.internalDependencies = pkg.dependencies.filter((dep) => packageNames.has(dep));
    }

    // 4. Compute topological build order (Kahn's algorithm)
    const buildOrder = this.computeTopologicalOrder(packages);

    return {
      isMonorepo: true,
      tool,
      rootPath: root,
      packages,
      buildOrder,
    };
  }

  private parsePnpmWorkspacePatterns(content: string): string[] {
    const lines = content.split(/\r?\n/);
    const patterns: string[] = [];
    let inPackages = false;

    for (const line of lines) {
      if (line.startsWith("packages:")) {
        inPackages = true;
        continue;
      }
      if (inPackages) {
        const match = line.match(/^\s*-\s*['"]?([^'"]+)['"]?/);
        if (match && match[1]) {
          patterns.push(match[1]);
        } else if (!line.startsWith(" ") && line.trim().length > 0) {
          break;
        }
      }
    }

    return patterns.length > 0 ? patterns : ["packages/*"];
  }

  private parseCargoWorkspaceMembers(content: string): string[] {
    const patterns: string[] = [];
    const membersMatch = content.match(/members\s*=\s*\[([\s\S]*?)\]/);
    if (membersMatch && membersMatch[1]) {
      const items = membersMatch[1].split(",");
      for (const item of items) {
        const cleaned = item.trim().replace(/^['"]|['"]$/g, "");
        if (cleaned) patterns.push(cleaned);
      }
    }
    return patterns.length > 0 ? patterns : ["crates/*", "members/*"];
  }

  private parseGradleIncludedProjects(content: string): string[] {
    const patterns: string[] = [];
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("include")) continue;
      const strMatches = trimmed.matchAll(/['"]([^'"]+)['"]/g);
      for (const m of strMatches) {
        if (m[1]) {
          const path = m[1].replace(/^:/, "").replace(/:/g, "/");
          patterns.push(path);
        }
      }
    }
    return patterns.length > 0 ? patterns : ["modules/*", "services/*", "subprojects/*"];
  }

  private findPackages(root: string, patterns: string[], tool: MonorepoTool): MonorepoPackage[] {
    const packages: MonorepoPackage[] = [];
    const visitedDirs = new Set<string>();

    for (const pattern of patterns) {
      const cleanPattern = pattern.replace(/\/\*+$/, "").replace(/\/\*\*$/, "");
      const baseDir = join(root, cleanPattern);

      // If pattern directly points to a package directory
      if (existsSync(baseDir) && !pattern.includes("*")) {
        const pkg = this.extractPackageFromDir(baseDir, tool);
        if (pkg && !visitedDirs.has(pkg.directory)) {
          visitedDirs.add(pkg.directory);
          packages.push(pkg);
        }
        continue;
      }

      if (!existsSync(baseDir)) continue;

      let entries: string[] = [];
      try {
        entries = readdirSync(baseDir);
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (["node_modules", ".git", "dist", "build", "target", ".next"].includes(entry)) continue;

        const pkgDir = join(baseDir, entry);
        let stat;
        try {
          stat = statSync(pkgDir);
        } catch {
          continue;
        }
        if (!stat.isDirectory()) continue;

        const pkg = this.extractPackageFromDir(pkgDir, tool);
        if (pkg && !visitedDirs.has(pkg.directory)) {
          visitedDirs.add(pkg.directory);
          packages.push(pkg);
        }
      }
    }

    return packages;
  }

  private extractPackageFromDir(pkgDir: string, _tool: MonorepoTool): MonorepoPackage | null {
    const pkgManifest = join(pkgDir, "package.json");
    const cargoManifest = join(pkgDir, "Cargo.toml");
    const gradleManifest = join(pkgDir, "build.gradle");
    const gradleKtsManifest = join(pkgDir, "build.gradle.kts");

    if (existsSync(pkgManifest)) {
      try {
        const manifest = JSON.parse(readFileSync(pkgManifest, "utf-8"));
        const deps = Object.keys(manifest.dependencies ?? {});
        const devDeps = Object.keys(manifest.devDependencies ?? {});
        return {
          name: manifest.name ?? pkgDir.split(/[\\/]/).pop() ?? "pkg",
          version: manifest.version,
          directory: pkgDir,
          manifestPath: pkgManifest,
          dependencies: deps,
          devDependencies: devDeps,
          internalDependencies: [],
        };
      } catch {
        return null;
      }
    }

    if (existsSync(cargoManifest)) {
      try {
        const text = readFileSync(cargoManifest, "utf-8");
        const nameMatch = text.match(/name\s*=\s*['"]([^'"]+)['"]/);
        const name = nameMatch ? nameMatch[1]! : pkgDir.split(/[\\/]/).pop() ?? "crate";
        return {
          name,
          directory: pkgDir,
          manifestPath: cargoManifest,
          dependencies: [],
          devDependencies: [],
          internalDependencies: [],
        };
      } catch {
        return null;
      }
    }

    if (existsSync(gradleManifest) || existsSync(gradleKtsManifest)) {
      const gPath = existsSync(gradleKtsManifest) ? gradleKtsManifest : gradleManifest;
      return {
        name: pkgDir.split(/[\\/]/).pop() ?? "module",
        directory: pkgDir,
        manifestPath: gPath,
        dependencies: [],
        devDependencies: [],
        internalDependencies: [],
      };
    }

    return null;
  }

  private computeTopologicalOrder(packages: MonorepoPackage[]): string[] {
    const inDegree: Map<string, number> = new Map();
    const adj: Map<string, string[]> = new Map();

    for (const pkg of packages) {
      inDegree.set(pkg.name, 0);
      adj.set(pkg.name, []);
    }

    for (const pkg of packages) {
      for (const dep of pkg.internalDependencies) {
        if (adj.has(dep)) {
          adj.get(dep)!.push(pkg.name);
          inDegree.set(pkg.name, (inDegree.get(pkg.name) ?? 0) + 1);
        }
      }
    }

    const queue: string[] = [];
    for (const [name, deg] of inDegree.entries()) {
      if (deg === 0) {
        queue.push(name);
      }
    }

    const order: string[] = [];
    while (queue.length > 0) {
      const u = queue.shift()!;
      order.push(u);

      const neighbors = adj.get(u) ?? [];
      for (const v of neighbors) {
        inDegree.set(v, inDegree.get(v)! - 1);
        if (inDegree.get(v) === 0) {
          queue.push(v);
        }
      }
    }

    // Append any remaining packages (e.g. if cyclic)
    for (const pkg of packages) {
      if (!order.includes(pkg.name)) {
        order.push(pkg.name);
      }
    }

    return order;
  }
}
