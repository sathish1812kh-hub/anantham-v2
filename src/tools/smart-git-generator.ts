/**
 * Smart Git Commit Message & Pull Request Generator
 * PRD-PART2-215: Smart Git Commit Message & Pull Request Generator
 */

export interface GitDiffSummary {
  filesChanged: string[];
  insertions: number;
  deletions: number;
  rawDiff?: string;
}

export interface GeneratedCommitMessage {
  subject: string;
  type: "feat" | "fix" | "refactor" | "test" | "docs" | "chore";
  scope?: string;
  body: string;
  breakingChange: boolean;
}

export interface GeneratedPullRequest {
  title: string;
  summary: string;
  changesList: string[];
  testingInstructions: string;
}

export class SmartGitGenerator {
  public generateCommitMessage(diff: GitDiffSummary): GeneratedCommitMessage {
    const files = diff.filesChanged;
    let type: GeneratedCommitMessage["type"] = "chore";
    let scope: string | undefined;

    // Detect scope from common directory
    if (files.some((f) => f.includes("test"))) {
      type = "test";
      scope = "tests";
    } else if (files.some((f) => f.endsWith(".md") || f.includes("docs/"))) {
      type = "docs";
      scope = "docs";
    } else if (files.some((f) => f.includes("fix") || f.includes("bug"))) {
      type = "fix";
      scope = "bugfix";
    } else if (files.length > 0) {
      type = "feat";
      const first = files[0]!;
      const match = first.match(/src\/([^/]+)/);
      if (match && match[1]) {
        scope = match[1];
      }
    }

    const scopeStr = scope ? `(${scope})` : "";
    const subject = `${type}${scopeStr}: update ${files.length} file(s) with ${diff.insertions} additions and ${diff.deletions} deletions`;
    const body = files.map((f) => `- ${f}`).join("\n");

    return {
      type,
      scope,
      subject,
      body,
      breakingChange: false,
    };
  }

  public generatePullRequest(diff: GitDiffSummary, branchName = "feature/update"): GeneratedPullRequest {
    const commit = this.generateCommitMessage(diff);
    const title = `${commit.type.toUpperCase()}: ${branchName.replace(/^feature\//, "").replace(/-/g, " ")}`;

    return {
      title,
      summary: `Automated PR generated for branch \`${branchName}\`. Modifies ${diff.filesChanged.length} file(s) across the codebase.`,
      changesList: diff.filesChanged.map((f) => `\`${f}\``),
      testingInstructions: "Run `npm run typecheck` and `npm test` to verify all assertions pass with zero regressions.",
    };
  }
}
