import { describe, it, expect } from "vitest";
import { SkillDependencyResolver } from "../../src/skills/skill-dependency.js";
import { ToolRegistry } from "../../src/tools/tool-registry.js";
import { type SkillMetadata } from "../../src/domain/skill.js";

describe("P5.3 Skills — Dependency Resolution & Cycle Detection", () => {
  const toolRegistry = new ToolRegistry();
  toolRegistry.register({
    definition: {
      name: "filesystem.read",
      description: "Read file",
      parametersSchema: { type: "object", properties: {} },
      isIdempotent: true,
      riskLevel: "low",
    },
    handler: async () => ({ content: "mock" }),
  });

  const resolver = new SkillDependencyResolver({ toolRegistry });

  it("resolves dependencies successfully when all tools and sub-skills are present", () => {
    const skillA: SkillMetadata = {
      id: "skill.a",
      name: "Skill A",
      description: "Skill A desc",
      version: "1.0.0",
      tools: ["filesystem.read"],
      mcp: [],
      skills: ["skill.b"],
      capabilities: [],
      runtime: "anantham>=2.0",
      tags: [],
      publisher: "local",
    };

    const skillB: SkillMetadata = {
      id: "skill.b",
      name: "Skill B",
      description: "Skill B desc",
      version: "1.0.0",
      tools: [],
      mcp: [],
      skills: [],
      capabilities: [],
      runtime: "anantham>=2.0",
      tags: [],
      publisher: "local",
    };

    const allSkills = new Map<string, SkillMetadata>([
      ["skill.a", skillA],
      ["skill.b", skillB],
    ]);

    const result = resolver.resolveDependencies(skillA, allSkills);
    expect(result.isResolved).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails resolution when required tool is missing in ToolRegistry", () => {
    const skillWithMissingTool: SkillMetadata = {
      id: "missing.tool.skill",
      name: "Skill with missing tool",
      description: "Needs uninstalled tool",
      version: "1.0.0",
      tools: ["unregistered.special.tool"],
      mcp: [],
      skills: [],
      capabilities: [],
      runtime: "anantham>=2.0",
      tags: [],
      publisher: "local",
    };

    const result = resolver.resolveDependencies(
      skillWithMissingTool,
      new Map([["missing.tool.skill", skillWithMissingTool]])
    );
    expect(result.isResolved).toBe(false);
    expect(result.missingTools).toContain("unregistered.special.tool");
  });

  it("detects cyclic sub-skill dependencies (A -> B -> A)", () => {
    const skillA: SkillMetadata = {
      id: "cycle.a",
      name: "Cycle A",
      description: "A",
      version: "1.0.0",
      tools: [],
      mcp: [],
      skills: ["cycle.b"],
      capabilities: [],
      runtime: "anantham>=2.0",
      tags: [],
      publisher: "local",
    };

    const skillB: SkillMetadata = {
      id: "cycle.b",
      name: "Cycle B",
      description: "B",
      version: "1.0.0",
      tools: [],
      mcp: [],
      skills: ["cycle.a"],
      capabilities: [],
      runtime: "anantham>=2.0",
      tags: [],
      publisher: "local",
    };

    const allSkills = new Map<string, SkillMetadata>([
      ["cycle.a", skillA],
      ["cycle.b", skillB],
    ]);

    const result = resolver.resolveDependencies(skillA, allSkills);
    expect(result.isResolved).toBe(false);
    expect(result.cyclicSkills.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Cyclic skill dependency");
  });
});
