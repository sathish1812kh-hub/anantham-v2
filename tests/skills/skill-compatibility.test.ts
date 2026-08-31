import { describe, it, expect } from "vitest";
import { SkillCompatibilityChecker } from "../../src/skills/skill-compatibility.js";
import { type SkillMetadata } from "../../src/domain/skill.js";

describe("P5.3 Skills — Model Capability & Runtime Compatibility", () => {
  const checker = new SkillCompatibilityChecker({ runtimeVersion: "2.0.0" });

  it("passes compatibility when model satisfies required capabilities", () => {
    const metadata: SkillMetadata = {
      id: "vision-analyzer",
      name: "Vision Analyzer",
      description: "Analyze UI mockups",
      version: "1.0.0",
      tools: [],
      mcp: [],
      skills: [],
      capabilities: ["vision", "toolCalling"],
      runtime: "anantham>=2.0",
      tags: [],
      publisher: "local",
    };

    const result = checker.checkCompatibility(metadata, ["vision", "toolCalling", "streaming"]);
    expect(result.isCompatible).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("fails compatibility when required model capability is missing", () => {
    const metadata: SkillMetadata = {
      id: "vision-analyzer",
      name: "Vision Analyzer",
      description: "Analyze UI mockups",
      version: "1.0.0",
      tools: [],
      mcp: [],
      skills: [],
      capabilities: ["vision"],
      runtime: "anantham>=2.0",
      tags: [],
      publisher: "local",
    };

    const result = checker.checkCompatibility(metadata, ["toolCalling"]); // vision missing
    expect(result.isCompatible).toBe(false);
    expect(result.reasons[0]).toContain("Missing required model capability");
  });
});
