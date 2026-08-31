/**
 * Anantham V2 — Skill Parser
 *
 * Extracts and validates YAML frontmatter and Markdown procedure sections from SKILL.md.
 */

import {
  type SkillManifest,
  type SkillFrontmatter,
  SkillFrontmatterSchema,
  SkillManifestSchema,
} from "../domain/skill.js";

export class SkillParser {
  /**
   * Parses raw markdown with YAML frontmatter into a validated SkillManifest.
   */
  public parse(rawContent: string, fallbackId?: string): SkillManifest {
    if (!rawContent || !rawContent.trim()) {
      throw new Error("Cannot parse empty SKILL.md content.");
    }

    const frontmatterMatch = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!frontmatterMatch) {
      throw new Error("Invalid SKILL.md format: Missing YAML frontmatter delimited by ---.");
    }

    const frontmatterYaml = frontmatterMatch[1] || "";
    const markdownBody = (frontmatterMatch[2] || "").trim();

    const frontmatterObj = this.parseSimpleYaml(frontmatterYaml);
    const validatedFrontmatter: SkillFrontmatter = SkillFrontmatterSchema.parse(frontmatterObj);

    const skillId = (fallbackId || validatedFrontmatter.name)
      .toLowerCase()
      .replace(/[^a-zA-Z0-9_\-\.]/g, "-");

    const procedure = this.parseProcedureSections(markdownBody);

    const manifest: SkillManifest = SkillManifestSchema.parse({
      metadata: {
        id: skillId,
        name: validatedFrontmatter.name,
        description: validatedFrontmatter.description,
        version: validatedFrontmatter.version,
        tools: validatedFrontmatter.tools || [],
        mcp: validatedFrontmatter.mcp || [],
        skills: validatedFrontmatter.skills || [],
        capabilities: validatedFrontmatter.capabilities || [],
        runtime: validatedFrontmatter.runtime || "anantham>=2.0",
        tags: validatedFrontmatter.tags || [],
        publisher: validatedFrontmatter.publisher || "local",
      },
      procedure: {
        ...procedure,
        rawMarkdown: markdownBody,
      },
    });

    return manifest;
  }

  private parseProcedureSections(markdownBody: string): {
    preconditions: string[];
    steps: string[];
    successCriteria: string[];
  } {
    const preconditions: string[] = [];
    const steps: string[] = [];
    const successCriteria: string[] = [];

    const lines = markdownBody.split(/\r?\n/);
    let currentSection: "none" | "preconditions" | "procedure" | "success" = "none";

    for (const line of lines) {
      const trimmed = line.trim();
      const lower = trimmed.toLowerCase();

      if (lower.startsWith("## preconditions") || lower.startsWith("# preconditions")) {
        currentSection = "preconditions";
        continue;
      } else if (lower.startsWith("## procedure") || lower.startsWith("# procedure") || lower.startsWith("## steps")) {
        currentSection = "procedure";
        continue;
      } else if (lower.startsWith("## success criteria") || lower.startsWith("# success criteria")) {
        currentSection = "success";
        continue;
      } else if (trimmed.startsWith("#")) {
        currentSection = "none";
        continue;
      }

      if (!trimmed) continue;

      if (currentSection === "preconditions") {
        preconditions.push(trimmed.replace(/^[-*]\s*/, ""));
      } else if (currentSection === "procedure") {
        steps.push(trimmed.replace(/^\d+\.\s*/, "").replace(/^[-*]\s*/, ""));
      } else if (currentSection === "success") {
        successCriteria.push(trimmed.replace(/^[-*]\s*/, ""));
      }
    }

    return { preconditions, steps, successCriteria };
  }

  private parseSimpleYaml(yamlString: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const lines = yamlString.split(/\r?\n/);

    let currentListKey: string | null = null;
    let currentList: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      if (trimmed.startsWith("- ") && currentListKey) {
        currentList.push(trimmed.slice(2).trim());
        continue;
      }

      if (currentListKey) {
        result[currentListKey] = currentList;
        currentListKey = null;
        currentList = [];
      }

      const colonIndex = line.indexOf(":");
      if (colonIndex !== -1) {
        const key = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim();

        if (!value) {
          currentListKey = key;
          currentList = [];
        } else {
          result[key] = value.replace(/^["'](.*)["']$/, "$1");
        }
      }
    }

    if (currentListKey) {
      result[currentListKey] = currentList;
    }

    return result;
  }
}
