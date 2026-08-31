import { describe, it, expect } from "vitest";
import { SkillProgressiveLoader } from "../../src/skills/skill-loader.js";
import { SkillParser } from "../../src/skills/skill-parser.js";

describe("P5.3 Skills — Progressive Loading & Token Budgeting", () => {
  const parser = new SkillParser();
  const loader = new SkillProgressiveLoader();

  const skillA = parser.parse(`---
name: database-migration
description: Safe SQLite WAL database schema migrations.
version: 1.0.0
---
# Database Migration
## Preconditions
- Database is unlocked.
## Procedure
1. Create backup.
2. Run migration.
## Success criteria
- Checksum matches.
`);

  const skillB = parser.parse(`---
name: frontend-bundling
description: Vite and React frontend build toolchain.
version: 1.0.0
---
# Frontend Bundling
## Procedure
1. Run npm build.
`);

  it("loads only relevant skills based on task goal and enforces token limits", () => {
    const result = loader.loadRelevantSkills([skillA, skillB], {
      taskGoal: "Need to run database migration for sqlite",
      maxTokens: 500,
    });

    expect(result.loaded).toHaveLength(1);
    expect(result.loaded[0]?.skillId).toBe("database-migration");
    expect(result.loaded[0]?.procedurePrompt).toContain("Safe SQLite WAL");
    expect(result.skipped).toHaveLength(0);
  });

  it("skips loading if token budget is too small", () => {
    const result = loader.loadRelevantSkills([skillA], {
      taskGoal: "database migration",
      maxTokens: 5, // very small token limit
    });

    expect(result.loaded).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toContain("Token budget exceeded");
  });
});
