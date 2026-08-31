import { describe, it, expect } from "vitest";
import { SkillTestRunner } from "../../src/skills/skill-test-runner.js";
import { SkillParser } from "../../src/skills/skill-parser.js";
import { type SkillTestFixture } from "../../src/domain/skill.js";

describe("P5.3 Skills — Deterministic Test Fixtures (/skills test)", () => {
  const runner = new SkillTestRunner();
  const parser = new SkillParser();

  const manifest = parser.parse(`---
name: build-tester
description: Automated test runner procedure.
version: 1.0.0
tools:
  - shell.execute
---
# Build Tester
## Preconditions
- Repo initialized.
## Procedure
1. Run npm test.
## Success criteria
- Code 0.
`);

  it("passes deterministic test fixture when preconditions and required tools match", async () => {
    const fixture: SkillTestFixture = {
      id: "fixture_001",
      skillId: "build-tester",
      inputProject: "sample-repo",
      expectedCommands: ["shell.execute"],
      expectedArtifacts: ["test-report.json"],
      expectedVerification: ["assertions pass"],
    };

    const result = await runner.runTest(manifest, fixture);
    expect(result.passed).toBe(true);
    expect(result.assertions.every((a) => a.passed)).toBe(true);
    expect(result.artifactsProduced).toContain("art_build-tester_test-report.json");
  });

  it("fails test fixture when required command/tool is not declared by skill", async () => {
    const failingFixture: SkillTestFixture = {
      id: "fixture_fail",
      skillId: "build-tester",
      inputProject: "sample-repo",
      expectedCommands: ["undeclared.tool"],
      expectedArtifacts: [],
      expectedVerification: [],
    };

    const result = await runner.runTest(manifest, failingFixture);
    expect(result.passed).toBe(false);
    expect(result.assertions.some((a) => !a.passed)).toBe(true);
  });
});
