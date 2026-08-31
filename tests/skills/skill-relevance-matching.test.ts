import { describe, it, expect } from "vitest";
import { SkillRelevanceMatcher } from "../../src/skills/skill-matcher.js";
import { type SkillMetadata } from "../../src/domain/skill.js";

describe("P5.3 Skills — Relevance Matching & Candidate Ranking", () => {
  const matcher = new SkillRelevanceMatcher();

  const candidates: SkillMetadata[] = [
    {
      id: "git-worktree-manager",
      name: "Git Worktree Manager",
      description: "Manage clean git worktrees for isolated agent execution.",
      version: "1.0.0",
      tools: ["git.status", "git.branch"],
      mcp: [],
      skills: [],
      capabilities: [],
      runtime: "anantham>=2.0",
      tags: ["git", "worktree", "vcs"],
      publisher: "official",
    },
    {
      id: "python-profiler",
      name: "Python Profiler",
      description: "Profile CPU and memory performance in Python applications.",
      version: "1.0.0",
      tools: ["shell.execute"],
      mcp: [],
      skills: [],
      capabilities: [],
      runtime: "anantham>=2.0",
      tags: ["python", "profiling", "performance"],
      publisher: "official",
    },
  ];

  it("ranks the most relevant candidate first based on query terms and tags", () => {
    const matches = matcher.match("create isolated git worktree branch", candidates);

    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]?.metadata.id).toBe("git-worktree-manager");
    expect(matches[0]?.matchedTerms).toContain("git");
    expect(matches[0]?.matchedTerms).toContain("worktree");
  });

  it("filters out candidates below minimum relevance threshold", () => {
    const matches = matcher.match("unrelated docker deployment query", candidates, {
      minScore: 0.5,
    });

    expect(matches).toHaveLength(0);
  });
});
