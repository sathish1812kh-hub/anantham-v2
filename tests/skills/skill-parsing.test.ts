import { describe, it, expect } from "vitest";
import { SkillParser } from "../../src/skills/skill-parser.js";

describe("P5.3 Skills — SKILL.md Parsing & Frontmatter Extraction", () => {
  const parser = new SkillParser();

  const sampleSkillMd = `---
name: software-testing
description: Run and interpret project tests.
version: 1.0.0
tools:
  - shell.execute
  - filesystem.read
tags:
  - testing
---

# Software Testing

## Preconditions
- Dependencies are installed.
- Repository is accessible.

## Procedure
1. Detect test runner.
2. Run focused tests.
3. Record evidence.

## Success criteria
- Required tests pass.
`;

  it("parses valid SKILL.md into structured manifest with procedure sections", () => {
    const manifest = parser.parse(sampleSkillMd);

    expect(manifest.metadata.id).toBe("software-testing");
    expect(manifest.metadata.name).toBe("software-testing");
    expect(manifest.metadata.version).toBe("1.0.0");
    expect(manifest.metadata.tools).toContain("shell.execute");
    expect(manifest.metadata.tags).toContain("testing");

    expect(manifest.procedure.preconditions).toHaveLength(2);
    expect(manifest.procedure.preconditions[0]).toBe("Dependencies are installed.");
    expect(manifest.procedure.steps).toHaveLength(3);
    expect(manifest.procedure.steps[0]).toBe("Detect test runner.");
    expect(manifest.procedure.successCriteria).toHaveLength(1);
    expect(manifest.procedure.successCriteria[0]).toBe("Required tests pass.");
  });

  it("rejects invalid or missing YAML frontmatter", () => {
    const invalidMd = `# Only Markdown Header\nNo frontmatter delimiters.`;
    expect(() => parser.parse(invalidMd)).toThrow(/Missing YAML frontmatter/);
  });
});
