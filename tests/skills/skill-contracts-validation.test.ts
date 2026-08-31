import { describe, it, expect } from "vitest";
import {
  SkillFrontmatterSchema,
  SkillMetadataSchema,
  SkillProcedureSchema,
  SkillManifestSchema,
  SkillRecordSchema,
  SkillTestFixtureSchema,
  SkillExecutionRecordSchema,
} from "../../src/domain/skill.js";

describe("P5.3 Skills — Domain Contracts & Runtime Validation", () => {
  it("validates SkillFrontmatterSchema and SkillMetadataSchema accurately", () => {
    const validFrontmatter = SkillFrontmatterSchema.parse({
      name: "software-testing",
      description: "Run and interpret project tests.",
      version: "1.0.0",
      tools: ["shell.execute", "filesystem.read"],
      capabilities: ["toolCalling"],
      tags: ["testing", "vitest"],
    });

    expect(validFrontmatter.name).toBe("software-testing");
    expect(validFrontmatter.tools).toContain("shell.execute");

    const metadata = SkillMetadataSchema.parse({
      id: "software-testing",
      name: validFrontmatter.name,
      description: validFrontmatter.description,
      version: validFrontmatter.version,
      tools: validFrontmatter.tools,
      mcp: [],
      skills: [],
      capabilities: validFrontmatter.capabilities,
      runtime: "anantham>=2.0",
      tags: validFrontmatter.tags,
      publisher: "official",
    });

    expect(metadata.id).toBe("software-testing");
  });

  it("validates SkillManifestSchema, SkillRecordSchema, and SkillExecutionRecordSchema", () => {
    const manifest = SkillManifestSchema.parse({
      metadata: {
        id: "code-review",
        name: "Code Review",
        description: "Perform AST and static code review.",
        version: "2.1.0",
        tools: ["filesystem.read"],
        mcp: [],
        skills: [],
        capabilities: [],
        runtime: "anantham>=2.0",
        tags: ["code-quality"],
        publisher: "local",
      },
      procedure: {
        preconditions: ["Working tree is clean"],
        steps: ["Inspect changed files", "Run linter", "Report issues"],
        successCriteria: ["0 critical defects"],
        rawMarkdown: "## Preconditions\n...",
      },
    });

    const record = SkillRecordSchema.parse({
      id: "code-review",
      manifest,
      trustState: "trusted",
      lifecycleState: "enabled",
    });

    expect(record.trustState).toBe("trusted");

    const execution = SkillExecutionRecordSchema.parse({
      id: "exec_001",
      skillId: "code-review",
      version: "2.1.0",
      projectId: "prj_test",
      toolsUsed: ["filesystem.read"],
      mcpUsed: [],
      result: "success",
      timestamp: new Date().toISOString(),
    });

    expect(execution.skillId).toBe("code-review");
  });
});
