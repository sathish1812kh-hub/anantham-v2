import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import {
  EcosystemCompatibilityAdapter,
  EcosystemConfigImporter,
} from "../../src/workspace/ecosystem-adapters.js";

describe("PRD-PART2-216: Ecosystem Source Compatibility & Config Importers", () => {
  const testDir = join(process.cwd(), ".test_ecosystem_import_" + Date.now());
  const adapter = new EcosystemCompatibilityAdapter();

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("detects and imports Claude Code, Cursor, Cline, and Aider configurations into native instructions", async () => {
    writeFileSync(join(testDir, "CLAUDE.md"), "# Claude Guidelines\nFollow TDD.");
    writeFileSync(join(testDir, ".cursorrules"), "# Cursor Rules\nStrict types only.");
    writeFileSync(
      join(testDir, ".roomodes"),
      JSON.stringify({
        customModes: [
          { name: "planner", roleDefinition: "Architect agent planning software phases." },
        ],
      })
    );
    writeFileSync(join(testDir, ".aider.conf.yml"), "model: gpt-4o\nauto-commits: true\n");

    const detected = adapter.detect(testDir);
    expect(detected).toContain("claude");
    expect(detected).toContain("cursor");
    expect(detected).toContain("cline");
    expect(detected).toContain("aider");

    // Import from Claude
    const claudeImport = await adapter.import("claude", testDir);
    expect(claudeImport.rules.length).toBe(1);
    expect(claudeImport.detectedFiles).toContain("CLAUDE.md");
    expect(claudeImport.converted.length).toBeGreaterThan(0);

    // Import from Cline
    const clineImport = await adapter.import("cline", testDir);
    expect(clineImport.agentManifests.length).toBe(1);
    expect(clineImport.agentManifests[0]!.name).toBe("planner");

    // Convert to native instruction text
    const nativeText = adapter.convertToNativeInstructions(clineImport);
    expect(nativeText).toContain("Anantham Imported Configuration (CLINE)");
    expect(nativeText).toContain("Agent: planner");
  });

  it("imports MCP server definitions from .cursor/mcp.json and .claude/mcp.json into MCPServerConfig", async () => {
    mkdirSync(join(testDir, ".cursor"), { recursive: true });
    writeFileSync(
      join(testDir, ".cursor", "mcp.json"),
      JSON.stringify({
        mcpServers: {
          fetch: {
            command: "uvx",
            args: ["mcp-server-fetch"],
          },
          sqlite: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-sqlite", "test.db"],
          },
        },
      })
    );

    const result = await adapter.import("cursor", testDir);
    expect(result.mcpServers.length).toBe(2);
    expect(result.mcpServers[0]!.name).toBe("fetch");
    expect(result.mcpServers[0]!.command).toBe("uvx");
    expect(result.mcpServers[1]!.name).toBe("sqlite");
    expect(result.manualActionRequired.length).toBeGreaterThan(0);
  });

  it("imports Gemini CLI configuration and model preferences", async () => {
    writeFileSync(join(testDir, "GEMINI.md"), "# Gemini Rules");
    writeFileSync(
      join(testDir, "gemini.json"),
      JSON.stringify({
        model: "gemini-1.5-pro",
        mcpServers: {
          git: { command: "uvx", args: ["mcp-server-git"] },
        },
      })
    );

    const res = await adapter.import("gemini", testDir);
    expect(res.rules.length).toBe(1);
    expect(res.mcpServers.length).toBe(1);
    expect(res.modelPreferences?.modelId).toBe("gemini-1.5-pro");
  });

  it("supports auto import across all detected ecosystems", async () => {
    writeFileSync(join(testDir, "CLAUDE.md"), "# Claude");
    writeFileSync(join(testDir, ".cursorrules"), "# Cursor");

    const res = await adapter.import("auto", testDir);
    expect(res.detectedFiles).toContain("CLAUDE.md");
    expect(res.detectedFiles).toContain(".cursorrules");
    expect(res.rules.length).toBe(2);
  });

  it("maintains backward compatibility with EcosystemConfigImporter", () => {
    const legacy = new EcosystemConfigImporter();
    writeFileSync(join(testDir, "CLAUDE.md"), "# Rules");
    const detected = legacy.detectEcosystemConfigs(testDir);
    expect(detected).toContain("claude");
  });
});
