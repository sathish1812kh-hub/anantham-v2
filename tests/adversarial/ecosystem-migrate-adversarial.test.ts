import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { EcosystemCompatibilityAdapter } from "../../src/workspace/ecosystem-adapters.js";
import { SlashMigrateCommand } from "../../src/cli/slash-migrate.js";

describe("Adversarial Stress Suite: EcosystemCompatibilityAdapter & /migrate Robustness", () => {
  const testDir = join(process.cwd(), ".test_adv_ecosystem_" + Date.now());
  const adapter = new EcosystemCompatibilityAdapter();
  const cmd = new SlashMigrateCommand(adapter);

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("1. Malformed & Corrupted MCP Configurations", () => {
    it("handles syntax-corrupted .claude/mcp.json gracefully by recording unsupported diagnostic", async () => {
      const claudeDir = join(testDir, ".claude");
      mkdirSync(claudeDir, { recursive: true });
      writeFileSync(join(claudeDir, "mcp.json"), "{ invalid JSON truncated content...");

      const res = await adapter.import("claude", testDir);
      expect(res.mcpServers.length).toBe(0);
      expect(res.unsupported.some((u) => u.feature === ".claude/mcp.json")).toBe(true);
      expect(res.unsupported[0]!.reason).toContain("Failed to parse MCP JSON");
    });

    it("handles null / primitive / array .claude/mcp.json structures without crashing", async () => {
      const claudeDir = join(testDir, ".claude");
      mkdirSync(claudeDir, { recursive: true });

      // Case A: JSON containing 'null'
      writeFileSync(join(claudeDir, "mcp.json"), "null");
      let res = await adapter.import("claude", testDir);
      expect(res).toBeDefined();

      // Case B: JSON containing a number
      writeFileSync(join(claudeDir, "mcp.json"), "12345");
      res = await adapter.import("claude", testDir);
      expect(res).toBeDefined();

      // Case C: JSON containing an array
      writeFileSync(join(claudeDir, "mcp.json"), "[]");
      res = await adapter.import("claude", testDir);
      expect(res).toBeDefined();

      // Case D: JSON where mcpServers values are non-objects
      writeFileSync(
        join(claudeDir, "mcp.json"),
        JSON.stringify({
          mcpServers: {
            broken1: null,
            broken2: "invalid_string",
            broken3: 42,
            validServer: { command: "npx", args: ["-y", "sqlite"] },
          },
        })
      );
      res = await adapter.import("claude", testDir);
      expect(res.mcpServers.length).toBe(1);
      expect(res.mcpServers[0]!.name).toBe("validServer");
    });

    it("handles corrupted .cursor/mcp.json and gemini.json without uncaught exceptions", async () => {
      mkdirSync(join(testDir, ".cursor"), { recursive: true });
      writeFileSync(join(testDir, ".cursor", "mcp.json"), "{ broken cursor json !!!");
      writeFileSync(join(testDir, "gemini.json"), "[ malformed gemini");

      const cursorRes = await adapter.import("cursor", testDir);
      expect(cursorRes.mcpServers.length).toBe(0);

      const geminiRes = await adapter.import("gemini", testDir);
      expect(geminiRes.mcpServers.length).toBe(0);
    });
  });

  describe("2. Corrupted & Edge Case .roomodes Files", () => {
    it("handles syntax-corrupted .roomodes safely", async () => {
      writeFileSync(join(testDir, ".roomodes"), "{{{{ invalid json syntax");

      const res = await adapter.import("cline", testDir);
      expect(res.agentManifests.length).toBe(0);
      expect(res.unsupported.some((u) => u.feature === ".roomodes")).toBe(true);
      expect(res.unsupported[0]!.reason).toContain("Failed to parse JSON");
    });

    it("handles non-array customModes in .roomodes gracefully", async () => {
      writeFileSync(
        join(testDir, ".roomodes"),
        JSON.stringify({ customModes: "not_an_array" })
      );

      const res = await adapter.import("cline", testDir);
      expect(res.agentManifests.length).toBe(0);
    });

    it("handles customModes array containing nulls, primitives, or empty objects with default fallbacks", async () => {
      writeFileSync(
        join(testDir, ".roomodes"),
        JSON.stringify({
          customModes: [
            null,
            42,
            {},
            { slug: "qa-agent", roleDefinition: "QA testing" },
            { name: "coder-agent", customInstructions: "Write clean code", groups: ["edit", "read"] },
          ],
        })
      );

      const res = await adapter.import("cline", testDir);
      // Nulls in array should be caught or skipped
      expect(res).toBeDefined();
    });
  });

  describe("3. Unrecognized Ecosystems & Missing Configurations", () => {
    it("records unsupported diagnostic for unknown ecosystem request", async () => {
      const res = await adapter.import("nonexistent_framework_xyz", testDir);
      expect(res.unsupported.length).toBeGreaterThan(0);
      expect(res.unsupported[0]!.feature).toBe("nonexistent_framework_xyz");
      expect(res.unsupported[0]!.reason).toContain("is not recognized");
    });

    it("handles empty / zero-byte configuration files without errors", async () => {
      writeFileSync(join(testDir, "CLAUDE.md"), "");
      writeFileSync(join(testDir, ".cursorrules"), "");
      writeFileSync(join(testDir, ".clinerules"), "");
      writeFileSync(join(testDir, ".aider.conf.yml"), "");

      const res = await adapter.import("auto", testDir);
      expect(res.detectedFiles.length).toBe(4);
      expect(res.rules.length).toBe(4);
    });
  });

  describe("4. Slash Command /migrate & --dry-run Durability / Non-Destruction", () => {
    it("guarantees --dry-run performs ZERO filesystem writes and leaves workspace untouched", async () => {
      writeFileSync(join(testDir, "CLAUDE.md"), "# Claude Guidelines\nRule: TDD only.");
      const ananthamPath = join(testDir, "ANANTHAM.md");

      // Verify ANANTHAM.md does not exist yet
      expect(existsSync(ananthamPath)).toBe(false);

      const res = await cmd.execute(["claude", "--dry-run"], testDir);

      expect(res.success).toBe(true);
      expect(res.dryRun).toBe(true);
      expect(res.outputPath).toBeUndefined();
      expect(res.message).toContain("[DRY RUN]");
      expect(res.filesMigrated).toContain("CLAUDE.md");

      // Disk verification: ANANTHAM.md must NOT have been created
      expect(existsSync(ananthamPath)).toBe(false);
    });

    it("guarantees --dry-run does NOT overwrite existing ANANTHAM.md content", async () => {
      const originalAnantham = "# Existing Anantham Configuration\nOriginal Authoritative Content.";
      const ananthamPath = join(testDir, "ANANTHAM.md");
      writeFileSync(ananthamPath, originalAnantham);
      writeFileSync(join(testDir, "CLAUDE.md"), "# New Claude Rules");

      const res = await cmd.execute(["claude", "--dry-run"], testDir);

      expect(res.success).toBe(true);
      expect(res.dryRun).toBe(true);

      // Verify file content is completely unaltered
      const currentContent = readFileSync(ananthamPath, "utf-8");
      expect(currentContent).toBe(originalAnantham);
    });

    it("handles non-existent target source gracefully in /migrate", async () => {
      const res = await cmd.execute(["nonexistent_source"], testDir);
      expect(res.success).toBe(false);
      expect(res.message).toContain("No configuration files found for 'nonexistent_source'");
      expect(res.filesMigrated).toEqual([]);
    });

    it("handles /migrate with custom --output path and correctly creates target file", async () => {
      writeFileSync(join(testDir, "GEMINI.md"), "# Gemini Rules");

      const customFile = "CUSTOM_AGENTS.md";
      const res = await cmd.execute(["gemini", `--output=${customFile}`], testDir);

      expect(res.success).toBe(true);
      expect(res.outputPath).toBe(join(testDir, customFile));
      expect(existsSync(join(testDir, customFile))).toBe(true);

      const content = readFileSync(join(testDir, customFile), "utf-8");
      expect(content).toContain("Gemini Rules");
    });
  });
});
