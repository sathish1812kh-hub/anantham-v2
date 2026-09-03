import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { SlashMigrateCommand } from "../../src/cli/slash-migrate.js";

describe("PRD-PART2-217: Configuration Migration Slash Commands", () => {
  const testDir = join(process.cwd(), ".test_slash_migrate_" + Date.now());
  let cmd: SlashMigrateCommand;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    cmd = new SlashMigrateCommand();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("lists detected third-party tools when invoked with no arguments", async () => {
    writeFileSync(join(testDir, "CLAUDE.md"), "# Claude instructions");

    const res = await cmd.execute([], testDir);
    expect(res.success).toBe(true);
    expect(res.source).toBe("detection");
    expect(res.filesMigrated).toContain("claude");
  });

  it("executes /migrate claude and writes generated ANANTHAM.md", async () => {
    writeFileSync(join(testDir, "CLAUDE.md"), "# Claude instructions\nRule 1: Always test.");

    const res = await cmd.execute(["claude"], testDir);
    expect(res.success).toBe(true);
    expect(res.source).toBe("claude");
    expect(res.outputPath).toBeDefined();
    expect(existsSync(res.outputPath!)).toBe(true);

    const generated = readFileSync(res.outputPath!, "utf-8");
    expect(generated).toContain("Anantham Imported Configuration");
    expect(generated).toContain("Rule 1: Always test.");
  });

  it("supports --dry-run mode without modifying filesystem", async () => {
    writeFileSync(join(testDir, ".cursorrules"), "# Strict TypeScript Rules");

    const res = await cmd.execute(["cursor", "--dry-run"], testDir);
    expect(res.success).toBe(true);
    expect(res.dryRun).toBe(true);
    expect(res.outputPath).toBeUndefined();
    expect(existsSync(join(testDir, "ANANTHAM.md"))).toBe(false);
    expect(res.imported?.rules).toBe(1);
    expect(res.converted?.length).toBeGreaterThan(0);
  });

  it("supports custom --output destination path", async () => {
    writeFileSync(join(testDir, "GEMINI.md"), "# Gemini Guidelines");

    const customOut = "CUSTOM_RULES.md";
    const res = await cmd.execute(["gemini", `--output=${customOut}`], testDir);
    expect(res.success).toBe(true);
    expect(existsSync(join(testDir, customOut))).toBe(true);

    const content = readFileSync(join(testDir, customOut), "utf-8");
    expect(content).toContain("Gemini Guidelines");
  });

  it("handles migrate when specified tool configuration does not exist", async () => {
    const res = await cmd.execute(["cursor"], testDir);
    expect(res.success).toBe(false);
    expect(res.message).toContain("No configuration files found for 'cursor'");
  });
});
