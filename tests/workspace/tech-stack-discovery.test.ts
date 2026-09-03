import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { TechStackDiscoveryEngine } from "../../src/workspace/tech-stack-discovery.js";

describe("PRD-PROJ-005: Project Discovery & Tech Stack Bootstrap", () => {
  const testDir = join(process.cwd(), ".test_tech_stack_" + Date.now());
  const engine = new TechStackDiscoveryEngine();

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("detects TypeScript, Next.js, React, Vitest, ESLint, Biome, Docker, CI, and dev commands from package.json", () => {
    writeFileSync(
      join(testDir, "package.json"),
      JSON.stringify({
        name: "test-app",
        scripts: {
          dev: "next dev",
          build: "next build",
          test: "vitest run",
          lint: "eslint .",
        },
        dependencies: {
          next: "^14.0.0",
          react: "^18.2.0",
        },
        devDependencies: {
          typescript: "^5.0.0",
          vitest: "^1.0.0",
          eslint: "^8.0.0",
          "@biomejs/biome": "^1.0.0",
        },
      })
    );

    writeFileSync(join(testDir, "pnpm-lock.yaml"), "");
    writeFileSync(join(testDir, "Dockerfile"), "FROM node:20");
    writeFileSync(join(testDir, "docker-compose.yml"), "version: '3'");
    mkdirSync(join(testDir, ".github", "workflows"), { recursive: true });
    writeFileSync(join(testDir, ".github", "workflows", "ci.yml"), "name: CI");
    writeFileSync(join(testDir, "CLAUDE.md"), "# Instructions");
    writeFileSync(join(testDir, ".env"), "PORT=3000");

    const profile = engine.discover(testDir);
    expect(profile.primaryLanguage).toBe("typescript");
    expect(profile.packageManager).toBe("pnpm");
    expect(profile.frameworks).toContain("next.js");
    expect(profile.frameworks).toContain("react");
    expect(profile.testRunners).toContain("vitest");
    expect(profile.linters).toContain("eslint");
    expect(profile.linters).toContain("biome");
    expect(profile.hasDocker).toBe(true);
    expect(profile.dockerDetails?.hasDockerfile).toBe(true);
    expect(profile.dockerDetails?.hasCompose).toBe(true);
    expect(profile.hasCi).toBe(true);
    expect(profile.ci).toContain("github-actions");
    expect(profile.instructionFiles).toContain("CLAUDE.md");
    expect(profile.envFiles).toContain(".env");
    expect(profile.devCommands?.length).toBeGreaterThanOrEqual(4);
    expect(profile.suggestedTrustProfile).toBe("developer");
  });

  it("detects Python, FastAPI, Django, pytest, and ruff from pyproject.toml and requirements.txt", () => {
    writeFileSync(
      join(testDir, "pyproject.toml"),
      `[project]
name = "my-fastapi-service"
dependencies = [
    "fastapi>=0.100.0",
    "uvicorn>=0.22.0",
    "ruff>=0.1.0"
]
`
    );
    writeFileSync(join(testDir, "requirements.txt"), "django\npytest\n");
    writeFileSync(join(testDir, "pytest.ini"), "[pytest]\n");
    writeFileSync(join(testDir, "poetry.lock"), "");

    const profile = engine.discover(testDir);
    expect(profile.primaryLanguage).toBe("python");
    expect(profile.languages).toContain("python");
    expect(profile.packageManager).toBe("poetry");
    expect(profile.frameworks).toContain("fastapi");
    expect(profile.frameworks).toContain("django");
    expect(profile.testRunners).toContain("pytest");
    expect(profile.linters).toContain("ruff");
  });

  it("detects Rust, Cargo, Tokio, Axum, Clippy, and cargo test from Cargo.toml", () => {
    writeFileSync(
      join(testDir, "Cargo.toml"),
      `[package]
name = "my-rust-service"
version = "0.1.0"

[dependencies]
tokio = { version = "1.0", features = ["full"] }
axum = "0.7"
`
    );
    writeFileSync(join(testDir, "Cargo.lock"), "");

    const profile = engine.discover(testDir);
    expect(profile.primaryLanguage).toBe("rust");
    expect(profile.languages).toContain("rust");
    expect(profile.packageManager).toBe("cargo");
    expect(profile.frameworks).toContain("tokio");
    expect(profile.frameworks).toContain("axum");
    expect(profile.testRunners).toContain("cargo test");
    expect(profile.buildTools).toContain("cargo build");
    expect(profile.linters).toContain("clippy");
    expect(profile.linters).toContain("rustfmt");
  });

  it("detects Go, Gin, Echo, and go test from go.mod", () => {
    writeFileSync(
      join(testDir, "go.mod"),
      `module example.com/go-app

go 1.21

require (
    github.com/gin-gonic/gin v1.9.1
    github.com/labstack/echo v4.11.0
)
`
    );
    writeFileSync(join(testDir, "go.sum"), "");

    const profile = engine.discover(testDir);
    expect(profile.primaryLanguage).toBe("go");
    expect(profile.languages).toContain("go");
    expect(profile.packageManager).toBe("go modules");
    expect(profile.frameworks).toContain("gin");
    expect(profile.frameworks).toContain("echo");
    expect(profile.testRunners).toContain("go test");
    expect(profile.linters).toContain("golangci-lint");
  });

  it("detects Java and Spring Boot from pom.xml", () => {
    writeFileSync(
      join(testDir, "pom.xml"),
      `<project>
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.example</groupId>
  <artifactId>demo</artifactId>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
  </dependencies>
</project>`
    );

    const profile = engine.discover(testDir);
    expect(profile.primaryLanguage).toBe("java");
    expect(profile.packageManager).toBe("maven");
    expect(profile.frameworks).toContain("spring-boot");
    expect(profile.buildTools).toContain("mvn");
    expect(profile.testRunners).toContain("junit");
  });

  it("detects C++ and CMake from CMakeLists.txt and Makefile", () => {
    writeFileSync(join(testDir, "CMakeLists.txt"), "cmake_minimum_required(VERSION 3.10)\nproject(MyCppApp)");
    writeFileSync(join(testDir, "Makefile"), "all:\n\tg++ main.cpp -o app\n");

    const profile = engine.discover(testDir);
    expect(profile.primaryLanguage).toBe("cpp");
    expect(profile.buildTools).toContain("cmake");
    expect(profile.buildTools).toContain("make");
    expect(profile.devCommands).toContain("make");
  });
});
