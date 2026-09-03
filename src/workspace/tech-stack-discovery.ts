/**
 * Project Tech Stack Discovery & Bootstrap Engine
 * PRD-PROJ-005: Project Discovery & Tech Stack Bootstrap
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { MonorepoDiscoveryEngine, type MonorepoInfo } from "./monorepo-discovery.js";

export interface TechStackLanguage {
  language: string;
  primary: boolean;
  version?: string;
  sourceFilesCount?: number;
}

export interface TechStackPackageManager {
  name: "npm" | "pnpm" | "yarn" | "bun" | "pip" | "poetry" | "uv" | "pipenv" | "cargo" | "go" | "maven" | "gradle" | "unknown" | string;
  lockfile?: string;
  version?: string;
}

export interface TechStackProfile {
  primaryLanguage: string;
  languages: string[];
  detailedLanguages?: TechStackLanguage[];
  packageManager: string;
  packageManagers?: TechStackPackageManager[];
  frameworks: string[];
  testRunners: string[];
  buildTools: string[];
  linters: string[];
  devCommands?: string[];
  ci?: string[];
  hasDocker: boolean;
  dockerDetails?: {
    hasDockerfile: boolean;
    hasCompose: boolean;
    files: string[];
  };
  hasCi: boolean;
  hasGit: boolean;
  gitDetails?: {
    isRepo: boolean;
    branch?: string;
    remote?: string;
    isDirty?: boolean;
  };
  instructionFiles: string[];
  envFiles: string[];
  monorepo?: MonorepoInfo;
  suggestedModelProfile?: string;
  suggestedTrustProfile?: "untrusted" | "safe" | "developer" | "trusted" | "custom";
  detectedAt?: string;
  rootPath?: string;
}

export class TechStackDiscoveryEngine {
  private monorepoEngine: MonorepoDiscoveryEngine;

  constructor(monorepoEngine?: MonorepoDiscoveryEngine) {
    this.monorepoEngine = monorepoEngine ?? new MonorepoDiscoveryEngine();
  }

  public discover(projectRoot: string): TechStackProfile {
    const root = resolve(projectRoot);
    const languages = new Set<string>();
    const frameworks = new Set<string>();
    const testRunners = new Set<string>();
    const buildTools = new Set<string>();
    const linters = new Set<string>();
    const devCommands: string[] = [];
    const ciList: string[] = [];
    const instructionFiles: string[] = [];
    const envFiles: string[] = [];
    const dockerFiles: string[] = [];
    const packageManagers: TechStackPackageManager[] = [];

    let packageManager = "none";
    let primaryLanguage = "unknown";

    // 1. Git check
    const gitDir = join(root, ".git");
    const hasGit = existsSync(gitDir);
    let gitBranch: string | undefined;
    if (hasGit) {
      const headFile = join(gitDir, "HEAD");
      if (existsSync(headFile)) {
        try {
          const headContent = readFileSync(headFile, "utf-8").trim();
          if (headContent.startsWith("ref: refs/heads/")) {
            gitBranch = headContent.replace("ref: refs/heads/", "");
          } else {
            gitBranch = headContent.slice(0, 8);
          }
        } catch {
          // ignore
        }
      }
    }

    // 2. Node.js / TypeScript / JavaScript ecosystem
    const packageJsonPath = join(root, "package.json");
    if (existsSync(packageJsonPath)) {
      languages.add("javascript");
      primaryLanguage = "javascript";

      if (existsSync(join(root, "pnpm-lock.yaml"))) {
        packageManager = "pnpm";
        packageManagers.push({ name: "pnpm", lockfile: "pnpm-lock.yaml" });
      } else if (existsSync(join(root, "yarn.lock"))) {
        packageManager = "yarn";
        packageManagers.push({ name: "yarn", lockfile: "yarn.lock" });
      } else if (existsSync(join(root, "bun.lockb")) || existsSync(join(root, "bun.lock"))) {
        packageManager = "bun";
        packageManagers.push({ name: "bun", lockfile: existsSync(join(root, "bun.lockb")) ? "bun.lockb" : "bun.lock" });
      } else if (existsSync(join(root, "package-lock.json"))) {
        packageManager = "npm";
        packageManagers.push({ name: "npm", lockfile: "package-lock.json" });
      } else {
        packageManager = "npm";
        packageManagers.push({ name: "npm" });
      }

      try {
        const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
        const allDeps: Record<string, string> = {
          ...(pkg.dependencies ?? {}),
          ...(pkg.devDependencies ?? {}),
          ...(pkg.peerDependencies ?? {}),
        };

        if (allDeps["typescript"] || existsSync(join(root, "tsconfig.json"))) {
          languages.add("typescript");
          primaryLanguage = "typescript";
          buildTools.add("tsc");
        }

        // Frameworks
        if (allDeps["next"]) frameworks.add("next.js");
        if (allDeps["react"]) frameworks.add("react");
        if (allDeps["vue"]) frameworks.add("vue");
        if (allDeps["svelte"] || allDeps["@sveltejs/kit"]) frameworks.add("svelte");
        if (allDeps["@angular/core"]) frameworks.add("angular");
        if (allDeps["express"]) frameworks.add("express");
        if (allDeps["fastify"]) frameworks.add("fastify");
        if (allDeps["nest"] || allDeps["@nestjs/core"]) frameworks.add("nestjs");
        if (allDeps["@remix-run/node"] || allDeps["@remix-run/react"]) frameworks.add("remix");
        if (allDeps["nuxt"]) frameworks.add("nuxt");
        if (allDeps["astro"]) frameworks.add("astro");
        if (allDeps["solid-js"]) frameworks.add("solidjs");
        if (allDeps["hono"]) frameworks.add("hono");
        if (allDeps["koa"]) frameworks.add("koa");
        if (allDeps["electron"]) frameworks.add("electron");

        // Test runners
        if (allDeps["vitest"]) testRunners.add("vitest");
        if (allDeps["jest"]) testRunners.add("jest");
        if (allDeps["mocha"]) testRunners.add("mocha");
        if (allDeps["playwright"] || allDeps["@playwright/test"]) testRunners.add("playwright");
        if (allDeps["cypress"]) testRunners.add("cypress");

        // Build tools
        if (allDeps["vite"]) buildTools.add("vite");
        if (allDeps["webpack"]) buildTools.add("webpack");
        if (allDeps["esbuild"]) buildTools.add("esbuild");
        if (allDeps["rollup"]) buildTools.add("rollup");
        if (allDeps["tsup"]) buildTools.add("tsup");
        if (allDeps["turbo"] || existsSync(join(root, "turbo.json"))) buildTools.add("turborepo");
        if (allDeps["babel"] || allDeps["@babel/core"]) buildTools.add("babel");
        if (allDeps["@swc/core"]) buildTools.add("swc");

        // Linters
        if (allDeps["eslint"] || existsSync(join(root, ".eslintrc.json")) || existsSync(join(root, "eslint.config.js")) || existsSync(join(root, "eslint.config.mjs"))) {
          linters.add("eslint");
        }
        if (allDeps["prettier"] || existsSync(join(root, ".prettierrc")) || existsSync(join(root, "prettier.config.js"))) {
          linters.add("prettier");
        }
        if (allDeps["@biomejs/biome"] || existsSync(join(root, "biome.json"))) {
          linters.add("biome");
        }

        // Scripts -> Dev Commands
        if (pkg.scripts && typeof pkg.scripts === "object") {
          for (const [scriptName, scriptCmd] of Object.entries(pkg.scripts)) {
            devCommands.push(`${packageManager} run ${scriptName} (${scriptCmd})`);
          }
        }
      } catch {
        // ignore parse error
      }
    }

    // 3. Python ecosystem
    const hasPyProject = existsSync(join(root, "pyproject.toml"));
    const hasReqs = existsSync(join(root, "requirements.txt"));
    const hasPipfile = existsSync(join(root, "Pipfile"));
    const hasSetupPy = existsSync(join(root, "setup.py"));

    if (hasPyProject || hasReqs || hasPipfile || hasSetupPy) {
      languages.add("python");
      if (primaryLanguage === "unknown") primaryLanguage = "python";

      if (existsSync(join(root, "poetry.lock")) || hasPyProject) {
        if (existsSync(join(root, "poetry.lock"))) {
          packageManager = "poetry";
          packageManagers.push({ name: "poetry", lockfile: "poetry.lock" });
        } else if (existsSync(join(root, "uv.lock"))) {
          packageManager = "uv";
          packageManagers.push({ name: "uv", lockfile: "uv.lock" });
        } else if (existsSync(join(root, "Pipfile.lock"))) {
          packageManager = "pipenv";
          packageManagers.push({ name: "pipenv", lockfile: "Pipfile.lock" });
        } else {
          packageManager = packageManager === "none" ? "pip" : packageManager;
          packageManagers.push({ name: "pip" });
        }
      } else if (existsSync(join(root, "Pipfile.lock"))) {
        packageManager = "pipenv";
        packageManagers.push({ name: "pipenv", lockfile: "Pipfile.lock" });
      } else {
        packageManager = packageManager === "none" ? "pip" : packageManager;
        packageManagers.push({ name: "pip" });
      }

      // Python Frameworks & Linters inspection
      let pyContent = "";
      if (hasReqs) {
        try { pyContent += readFileSync(join(root, "requirements.txt"), "utf-8"); } catch {}
      }
      if (hasPyProject) {
        try { pyContent += "\n" + readFileSync(join(root, "pyproject.toml"), "utf-8"); } catch {}
      }

      if (/fastapi/i.test(pyContent)) frameworks.add("fastapi");
      if (/flask/i.test(pyContent)) frameworks.add("flask");
      if (/django/i.test(pyContent)) frameworks.add("django");
      if (/tornado/i.test(pyContent)) frameworks.add("tornado");
      if (/celery/i.test(pyContent)) frameworks.add("celery");

      if (existsSync(join(root, "pytest.ini")) || existsSync(join(root, "conftest.py")) || /pytest/i.test(pyContent)) {
        testRunners.add("pytest");
      }

      if (/ruff/i.test(pyContent) || existsSync(join(root, "ruff.toml"))) linters.add("ruff");
      if (/flake8/i.test(pyContent) || existsSync(join(root, ".flake8"))) linters.add("flake8");
      if (/black/i.test(pyContent)) linters.add("black");
      if (/pylint/i.test(pyContent) || existsSync(join(root, ".pylintrc"))) linters.add("pylint");
      if (/mypy/i.test(pyContent) || existsSync(join(root, "mypy.ini"))) linters.add("mypy");
    }

    // 4. Rust ecosystem
    const cargoTomlPath = join(root, "Cargo.toml");
    if (existsSync(cargoTomlPath)) {
      languages.add("rust");
      if (primaryLanguage === "unknown") primaryLanguage = "rust";
      packageManager = packageManager === "none" ? "cargo" : packageManager;
      packageManagers.push({
        name: "cargo",
        lockfile: existsSync(join(root, "Cargo.lock")) ? "Cargo.lock" : undefined,
      });
      testRunners.add("cargo test");
      buildTools.add("cargo build");
      linters.add("clippy");
      linters.add("rustfmt");

      try {
        const cargoText = readFileSync(cargoTomlPath, "utf-8");
        if (/actix-web/i.test(cargoText)) frameworks.add("actix-web");
        if (/axum/i.test(cargoText)) frameworks.add("axum");
        if (/rocket/i.test(cargoText)) frameworks.add("rocket");
        if (/tokio/i.test(cargoText)) frameworks.add("tokio");
        if (/tauri/i.test(cargoText)) frameworks.add("tauri");
      } catch {}
    }

    // 5. Go ecosystem
    const goModPath = join(root, "go.mod");
    if (existsSync(goModPath)) {
      languages.add("go");
      if (primaryLanguage === "unknown") primaryLanguage = "go";
      packageManager = packageManager === "none" ? "go modules" : packageManager;
      packageManagers.push({
        name: "go",
        lockfile: existsSync(join(root, "go.sum")) ? "go.sum" : undefined,
      });
      testRunners.add("go test");
      buildTools.add("go build");
      linters.add("golangci-lint");

      try {
        const goText = readFileSync(goModPath, "utf-8");
        if (/github\.com\/gin-gonic\/gin/i.test(goText)) frameworks.add("gin");
        if (/github\.com\/labstack\/echo/i.test(goText)) frameworks.add("echo");
        if (/github\.com\/gofiber\/fiber/i.test(goText)) frameworks.add("fiber");
        if (/github\.com\/go-chi\/chi/i.test(goText)) frameworks.add("chi");
      } catch {}
    }

    // 6. Java & Kotlin ecosystem
    const pomXmlPath = join(root, "pom.xml");
    const buildGradlePath = join(root, "build.gradle");
    const buildGradleKtsPath = join(root, "build.gradle.kts");

    if (existsSync(pomXmlPath)) {
      languages.add("java");
      if (primaryLanguage === "unknown") primaryLanguage = "java";
      packageManagers.push({ name: "maven" });
      if (packageManager === "none") packageManager = "maven";
      buildTools.add("mvn");
      testRunners.add("junit");

      try {
        const pomText = readFileSync(pomXmlPath, "utf-8");
        if (/spring-boot/i.test(pomText)) frameworks.add("spring-boot");
        if (/micronaut/i.test(pomText)) frameworks.add("micronaut");
        if (/quarkus/i.test(pomText)) frameworks.add("quarkus");
      } catch {}
    }

    if (existsSync(buildGradlePath) || existsSync(buildGradleKtsPath)) {
      languages.add("java");
      if (existsSync(buildGradleKtsPath)) languages.add("kotlin");
      if (primaryLanguage === "unknown") primaryLanguage = existsSync(buildGradleKtsPath) ? "kotlin" : "java";
      packageManagers.push({ name: "gradle" });
      if (packageManager === "none") packageManager = "gradle";
      buildTools.add("gradle");
      testRunners.add("junit");

      const gFile = existsSync(buildGradleKtsPath) ? buildGradleKtsPath : buildGradlePath;
      try {
        const gText = readFileSync(gFile, "utf-8");
        if (/spring-boot|springframework\.boot/i.test(gText)) frameworks.add("spring-boot");
        if (/ktor/i.test(gText)) frameworks.add("ktor");
      } catch {}
    }

    // 7. C / C++ ecosystem
    if (existsSync(join(root, "CMakeLists.txt"))) {
      languages.add("cpp");
      if (primaryLanguage === "unknown") primaryLanguage = "cpp";
      buildTools.add("cmake");
    }
    if (existsSync(join(root, "Makefile"))) {
      buildTools.add("make");
      devCommands.push("make");
    }

    // 8. PHP & Ruby
    if (existsSync(join(root, "composer.json"))) {
      languages.add("php");
      if (primaryLanguage === "unknown") primaryLanguage = "php";
      packageManagers.push({ name: "composer" });
      if (packageManager === "none") packageManager = "composer";
      testRunners.add("phpunit");
    }
    if (existsSync(join(root, "Gemfile"))) {
      languages.add("ruby");
      if (primaryLanguage === "unknown") primaryLanguage = "ruby";
      packageManagers.push({ name: "bundler" });
      if (packageManager === "none") packageManager = "bundler";
      testRunners.add("rspec");
    }

    // 9. Docker
    for (const dFile of ["Dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yaml", "compose.yml", ".dockerignore"]) {
      if (existsSync(join(root, dFile))) {
        dockerFiles.push(dFile);
      }
    }
    const hasDocker = dockerFiles.length > 0;

    // 10. CI Configurations
    const ghWorkflowsDir = join(root, ".github", "workflows");
    if (existsSync(ghWorkflowsDir)) {
      ciList.push("github-actions");
      try {
        const wfFiles = readdirSync(ghWorkflowsDir);
        for (const wf of wfFiles) {
          if (wf.endsWith(".yml") || wf.endsWith(".yaml")) {
            ciList.push(`.github/workflows/${wf}`);
          }
        }
      } catch {}
    }
    if (existsSync(join(root, ".gitlab-ci.yml"))) ciList.push("gitlab-ci");
    if (existsSync(join(root, ".circleci", "config.yml"))) ciList.push("circleci");
    if (existsSync(join(root, "bitbucket-pipelines.yml"))) ciList.push("bitbucket-pipelines");
    if (existsSync(join(root, "azure-pipelines.yml"))) ciList.push("azure-pipelines");
    if (existsSync(join(root, "Jenkinsfile"))) ciList.push("jenkins");
    const hasCi = ciList.length > 0;

    // 11. Instruction files
    const recognizedInstructions = [
      "ANANTHAM.md",
      "AGENTS.md",
      "CLAUDE.md",
      "GEMINI.md",
      ".cursorrules",
      ".windsurfrules",
      "CONTRIBUTING.md",
      "README.md",
    ];
    for (const file of recognizedInstructions) {
      if (existsSync(join(root, file))) {
        instructionFiles.push(file);
      }
    }
    const cursorRulesDir = join(root, ".cursor", "rules");
    if (existsSync(cursorRulesDir)) {
      try {
        const cRules = readdirSync(cursorRulesDir);
        for (const r of cRules) {
          if (r.endsWith(".md") || r.endsWith(".mdc")) {
            instructionFiles.push(`.cursor/rules/${r}`);
          }
        }
      } catch {}
    }

    // 12. Environment files
    for (const file of [".env", ".env.local", ".env.example", ".env.development", ".env.production", ".env.test", ".env.staging"]) {
      if (existsSync(join(root, file))) {
        envFiles.push(file);
      }
    }

    // 13. Monorepo Discovery
    let monorepoInfo: MonorepoInfo | undefined;
    try {
      monorepoInfo = this.monorepoEngine.discover(root);
    } catch {
      // ignore
    }

    // 14. Detailed Languages array
    const detailedLanguages: TechStackLanguage[] = Array.from(languages).map((lang) => ({
      language: lang,
      primary: lang === primaryLanguage,
    }));

    // 15. Trust & Model Profile suggestions
    let suggestedTrustProfile: "untrusted" | "safe" | "developer" | "trusted" = "safe";
    if (languages.size > 0 && (testRunners.size > 0 || hasGit)) {
      suggestedTrustProfile = "developer";
    }

    return {
      primaryLanguage,
      languages: Array.from(languages),
      detailedLanguages,
      packageManager,
      packageManagers,
      frameworks: Array.from(frameworks),
      testRunners: Array.from(testRunners),
      buildTools: Array.from(buildTools),
      linters: Array.from(linters),
      devCommands,
      ci: ciList,
      hasDocker,
      dockerDetails: {
        hasDockerfile: dockerFiles.includes("Dockerfile"),
        hasCompose: dockerFiles.some((f) => f.includes("compose")),
        files: dockerFiles,
      },
      hasCi,
      hasGit,
      gitDetails: {
        isRepo: hasGit,
        branch: gitBranch,
      },
      instructionFiles,
      envFiles,
      monorepo: monorepoInfo,
      suggestedModelProfile: "default",
      suggestedTrustProfile,
      detectedAt: new Date().toISOString(),
      rootPath: root,
    };
  }
}
