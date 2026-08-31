import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ChangeSetCalculator } from "../../src/execution/change-set-calculator.js";
import { createTempGitRepo, type TempGitRepo } from "./git-test-helper.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

describe("P6.4 Parallel Execution — Change-Set Calculation", () => {
  let tempRepo: TempGitRepo;
  let calculator: ChangeSetCalculator;

  beforeEach(async () => {
    tempRepo = await createTempGitRepo();
    calculator = new ChangeSetCalculator();
  });

  afterEach(() => {
    tempRepo.cleanup();
  });

  it("calculates added, modified, deleted files, cryptographic hashes, and diffs", async () => {
    // 1. Modify an existing file
    fs.appendFileSync(path.join(tempRepo.repoPath, "README.md"), "\nAdded line by test\n");

    // 2. Add a new domain contract
    fs.writeFileSync(
      path.join(tempRepo.repoPath, "src", "domain", "new_entity.ts"),
      "export interface NewEntity {\n  id: string;\n}\n"
    );

    // 3. Delete a file
    fs.unlinkSync(path.join(tempRepo.repoPath, "src", "persistence", "migrations", "001_initial.ts"));

    await execAsync('git add -A && git commit -m "feat: multi changes"', { cwd: tempRepo.repoPath });

    const changeSet = await calculator.calculate(
      "ws_test_cs",
      tempRepo.repoPath,
      tempRepo.initialCommit
    );

    expect(changeSet.filesModified).toContain("README.md");
    expect(changeSet.filesAdded.some((f) => f.includes("new_entity.ts"))).toBe(true);
    expect(changeSet.filesDeleted.some((f) => f.includes("001_initial.ts"))).toBe(true);
    expect(changeSet.fileHashes["README.md"]).toBeDefined();
    expect(changeSet.changeSetHash).toBeDefined();
    expect(changeSet.symbolsModified?.some((s) => s.symbol === "NewEntity")).toBe(true);
  });
});
