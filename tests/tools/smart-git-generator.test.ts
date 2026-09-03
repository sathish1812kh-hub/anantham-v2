import { describe, it, expect } from "vitest";
import { SmartGitGenerator } from "../../src/tools/smart-git-generator.js";

describe("PRD-PART2-215: Smart Git Commit Message & Pull Request Generator", () => {
  const gen = new SmartGitGenerator();

  it("generates conventional commit message for feature additions", () => {
    const diff = {
      filesChanged: ["src/cli/interactive-shell.ts", "src/cli/slash-commands.ts"],
      insertions: 120,
      deletions: 10,
    };

    const commit = gen.generateCommitMessage(diff);
    expect(commit.type).toBe("feat");
    expect(commit.scope).toBe("cli");
    expect(commit.subject).toContain("feat(cli): update 2 file(s)");
    expect(commit.body).toContain("src/cli/interactive-shell.ts");
  });

  it("generates conventional commit message for test updates", () => {
    const diff = {
      filesChanged: ["tests/cli/interactive-shell.test.ts"],
      insertions: 45,
      deletions: 0,
    };

    const commit = gen.generateCommitMessage(diff);
    expect(commit.type).toBe("test");
    expect(commit.subject).toContain("test(tests):");
  });

  it("synthesizes structured pull request descriptions", () => {
    const diff = {
      filesChanged: ["src/auth.ts"],
      insertions: 30,
      deletions: 5,
    };

    const pr = gen.generatePullRequest(diff, "feature/oauth2-login");
    expect(pr.title).toBe("FEAT: oauth2 login");
    expect(pr.summary).toContain("feature/oauth2-login");
    expect(pr.changesList).toContain("`src/auth.ts`");
    expect(pr.testingInstructions).toContain("npm test");
  });
});
