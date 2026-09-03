/**
 * Ecosystem Source Compatibility & Config Importers
 * PRD-PART2-216: Ecosystem Source Compatibility & Config Importers
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

export type EcosystemSource =
  | "claude"
  | "gemini"
  | "cursor"
  | "cline"
  | "roo"
  | "aider"
  | "opencode"
  | "auto"
  | "all";

export interface MCPServerConfig {
  id: string;
  name: string;
  transport: "stdio" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  disabled?: boolean;
}

export interface AgentManifest {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  tools?: string[];
  model?: string;
}

export interface MemoryItemImport {
  id: string;
  content: string;
  type: string;
  tags: string[];
  scope: "project" | "session";
}

export interface ConvertedMapping {
  source: string;
  target: string;
  description: string;
}

export interface UnsupportedFeature {
  feature: string;
  reason: string;
}

export interface EcosystemImportResult {
  ecosystem: string;
  sourcePath: string;
  detectedFiles: string[];
  mcpServers: MCPServerConfig[];
  agentManifests: AgentManifest[];
  rules: string[];
  memoryItems?: MemoryItemImport[];
  modelPreferences?: { modelId?: string; provider?: string };
  importedCount: number;
  converted: ConvertedMapping[];
  unsupported: UnsupportedFeature[];
  manualActionRequired: string[];
  timestamp: string;
}

export interface ImportedConfig {
  source: EcosystemSource;
  detectedFiles: string[];
  rules: string[];
  customModes: Array<{ name: string; prompt: string; tools?: string[] }>;
  mcpServers?: MCPServerConfig[];
  modelPreferences?: { modelId?: string; provider?: string };
}

export class EcosystemCompatibilityAdapter {
  /**
   * Detect all third-party ecosystem configuration files in the project root.
   */
  public detect(projectRoot: string): string[] {
    const root = resolve(projectRoot);
    const sources = new Set<string>();

    // Claude Code
    if (existsSync(join(root, "CLAUDE.md")) || existsSync(join(root, ".claude"))) {
      sources.add("claude");
    }

    // Gemini CLI
    if (
      existsSync(join(root, "GEMINI.md")) ||
      existsSync(join(root, "gemini.json")) ||
      existsSync(join(root, ".gemini"))
    ) {
      sources.add("gemini");
    }

    // Cursor
    if (
      existsSync(join(root, ".cursorrules")) ||
      existsSync(join(root, ".cursor"))
    ) {
      sources.add("cursor");
    }

    // Cline / Roo
    if (
      existsSync(join(root, ".roomodes")) ||
      existsSync(join(root, ".clinerules")) ||
      existsSync(join(root, ".cline"))
    ) {
      sources.add("cline");
    }

    // Aider
    if (
      existsSync(join(root, ".aider.conf.yml")) ||
      existsSync(join(root, ".aider.chat.history.md"))
    ) {
      sources.add("aider");
    }

    // OpenCode
    if (
      existsSync(join(root, "opencode.json")) ||
      existsSync(join(root, ".opencode"))
    ) {
      sources.add("opencode");
    }

    return Array.from(sources);
  }

  public detectEcosystemConfigs(projectRoot: string): EcosystemSource[] {
    return this.detect(projectRoot) as EcosystemSource[];
  }

  /**
   * Import configuration from a specific ecosystem or all detected ecosystems.
   */
  public async import(
    ecosystem: string,
    projectRoot: string,
    _options: { dryRun?: boolean } = {}
  ): Promise<EcosystemImportResult> {
    const root = resolve(projectRoot);
    const target = ecosystem.toLowerCase();

    const detectedFiles: string[] = [];
    const mcpServers: MCPServerConfig[] = [];
    const agentManifests: AgentManifest[] = [];
    const rules: string[] = [];
    const converted: ConvertedMapping[] = [];
    const unsupported: UnsupportedFeature[] = [];
    const manualActionRequired: string[] = [];
    let modelPreferences: { modelId?: string; provider?: string } | undefined;

    const sourcesToProcess =
      target === "auto" || target === "all"
        ? this.detect(root)
        : [target];

    for (const src of sourcesToProcess) {
      switch (src) {
        case "claude": {
          const claudeMd = join(root, "CLAUDE.md");
          if (existsSync(claudeMd)) {
            detectedFiles.push("CLAUDE.md");
            const text = readFileSync(claudeMd, "utf-8");
            rules.push(text);
            converted.push({
              source: "CLAUDE.md",
              target: "ANANTHAM.md / Project Instructions",
              description: "Imported Claude instructions into project context",
            });
          }

          const claudeMcp = join(root, ".claude", "mcp.json");
          if (existsSync(claudeMcp)) {
            detectedFiles.push(".claude/mcp.json");
            try {
              const data = JSON.parse(readFileSync(claudeMcp, "utf-8"));
              const servers = data.mcpServers ?? data;
              for (const [name, cfg] of Object.entries<any>(servers)) {
                if (typeof cfg === "object" && cfg !== null) {
                  mcpServers.push({
                    id: `mcp_${name}`,
                    name,
                    transport: cfg.transport === "sse" ? "sse" : "stdio",
                    command: cfg.command,
                    args: cfg.args,
                    env: cfg.env,
                    url: cfg.url,
                    disabled: cfg.disabled ?? false,
                  });
                  converted.push({
                    source: `.claude/mcp.json -> ${name}`,
                    target: `MCPServerConfig (${name})`,
                    description: "Imported MCP server definition",
                  });
                }
              }
            } catch (err: any) {
              unsupported.push({
                feature: ".claude/mcp.json",
                reason: `Failed to parse MCP JSON: ${err.message}`,
              });
            }
          }
          break;
        }

        case "gemini": {
          const geminiMd = join(root, "GEMINI.md");
          if (existsSync(geminiMd)) {
            detectedFiles.push("GEMINI.md");
            const text = readFileSync(geminiMd, "utf-8");
            rules.push(text);
            converted.push({
              source: "GEMINI.md",
              target: "Project Instructions",
              description: "Imported Gemini CLI rules",
            });
          }

          const geminiJson = join(root, "gemini.json");
          if (existsSync(geminiJson)) {
            detectedFiles.push("gemini.json");
            try {
              const data = JSON.parse(readFileSync(geminiJson, "utf-8"));
              if (data.mcpServers) {
                for (const [name, cfg] of Object.entries<any>(data.mcpServers)) {
                  mcpServers.push({
                    id: `mcp_${name}`,
                    name,
                    transport: cfg.transport === "sse" ? "sse" : "stdio",
                    command: cfg.command,
                    args: cfg.args,
                    env: cfg.env,
                    url: cfg.url,
                  });
                }
              }
              if (data.model) {
                modelPreferences = { modelId: data.model };
              }
            } catch {}
          }
          break;
        }

        case "cursor": {
          const cursorRules = join(root, ".cursorrules");
          if (existsSync(cursorRules)) {
            detectedFiles.push(".cursorrules");
            const text = readFileSync(cursorRules, "utf-8");
            rules.push(text);
            converted.push({
              source: ".cursorrules",
              target: "Project Instructions",
              description: "Imported Cursor rules",
            });
          }

          const cursorRulesDir = join(root, ".cursor", "rules");
          if (existsSync(cursorRulesDir)) {
            try {
              const files = readdirSync(cursorRulesDir);
              for (const f of files) {
                if (f.endsWith(".md") || f.endsWith(".mdc")) {
                  detectedFiles.push(`.cursor/rules/${f}`);
                  const rText = readFileSync(join(cursorRulesDir, f), "utf-8");
                  rules.push(rText);
                  converted.push({
                    source: `.cursor/rules/${f}`,
                    target: "Project Instructions",
                    description: `Imported modular Cursor rule ${f}`,
                  });
                }
              }
            } catch {}
          }

          const cursorMcp = join(root, ".cursor", "mcp.json");
          if (existsSync(cursorMcp)) {
            detectedFiles.push(".cursor/mcp.json");
            try {
              const data = JSON.parse(readFileSync(cursorMcp, "utf-8"));
              const servers = data.mcpServers ?? {};
              for (const [name, cfg] of Object.entries<any>(servers)) {
                mcpServers.push({
                  id: `mcp_${name}`,
                  name,
                  transport: cfg.transport === "sse" ? "sse" : "stdio",
                  command: cfg.command,
                  args: cfg.args,
                  env: cfg.env,
                  url: cfg.url,
                });
                converted.push({
                  source: `.cursor/mcp.json -> ${name}`,
                  target: `MCPServerConfig (${name})`,
                  description: "Imported Cursor MCP server",
                });
              }
            } catch {}
          }
          break;
        }

        case "cline":
        case "roo": {
          const rooModes = join(root, ".roomodes");
          if (existsSync(rooModes)) {
            detectedFiles.push(".roomodes");
            try {
              const data = JSON.parse(readFileSync(rooModes, "utf-8"));
              if (Array.isArray(data.customModes)) {
                for (const m of data.customModes) {
                  const manifest: AgentManifest = {
                    id: `agent_${m.slug ?? m.name ?? "custom"}`,
                    name: m.name ?? m.slug ?? "Custom Mode",
                    description: m.description ?? `Imported mode ${m.name}`,
                    systemPrompt: m.roleDefinition ?? m.customInstructions ?? "",
                    tools: m.groups,
                    model: m.model,
                  };
                  agentManifests.push(manifest);
                  converted.push({
                    source: `.roomodes -> ${manifest.name}`,
                    target: `AgentManifest (${manifest.id})`,
                    description: "Imported custom agent role/mode",
                  });
                }
              }
            } catch (err: any) {
              unsupported.push({
                feature: ".roomodes",
                reason: `Failed to parse JSON: ${err.message}`,
              });
            }
          }

          const clineRules = join(root, ".clinerules");
          if (existsSync(clineRules)) {
            detectedFiles.push(".clinerules");
            rules.push(readFileSync(clineRules, "utf-8"));
            converted.push({
              source: ".clinerules",
              target: "Project Instructions",
              description: "Imported Cline rules",
            });
          }
          break;
        }

        case "aider": {
          const aiderConf = join(root, ".aider.conf.yml");
          if (existsSync(aiderConf)) {
            detectedFiles.push(".aider.conf.yml");
            const text = readFileSync(aiderConf, "utf-8");
            rules.push(text);
            converted.push({
              source: ".aider.conf.yml",
              target: "Model Preferences & Project Instructions",
              description: "Imported Aider config",
            });

            // Extract model if present
            const modelMatch = text.match(/model:\s*([^\s\n]+)/);
            if (modelMatch && modelMatch[1]) {
              modelPreferences = { modelId: modelMatch[1] };
            }
          }
          break;
        }

        case "opencode": {
          const ocJson = join(root, "opencode.json");
          if (existsSync(ocJson)) {
            detectedFiles.push("opencode.json");
            try {
              const data = JSON.parse(readFileSync(ocJson, "utf-8"));
              if (data.instructions) rules.push(data.instructions);
              if (data.mcpServers) {
                for (const [name, cfg] of Object.entries<any>(data.mcpServers)) {
                  mcpServers.push({
                    id: `mcp_${name}`,
                    name,
                    transport: cfg.transport === "sse" ? "sse" : "stdio",
                    command: cfg.command,
                    args: cfg.args,
                    env: cfg.env,
                    url: cfg.url,
                  });
                }
              }
            } catch {}
          }
          break;
        }

        default:
          unsupported.push({
            feature: src,
            reason: `Ecosystem '${src}' is not recognized for automated conversion.`,
          });
          break;
      }
    }

    if (mcpServers.length > 0) {
      manualActionRequired.push(
        "Verify imported MCP servers in ToolGateway configuration and grant appropriate tool permissions."
      );
    }

    const importedCount =
      detectedFiles.length + mcpServers.length + agentManifests.length + rules.length;

    return {
      ecosystem: target,
      sourcePath: root,
      detectedFiles,
      mcpServers,
      agentManifests,
      rules,
      modelPreferences,
      importedCount,
      converted,
      unsupported,
      manualActionRequired,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Compatibility method matching legacy signature.
   */
  public importFromSource(projectRoot: string, source: string): ImportedConfig {
    const root = resolve(projectRoot);
    const detectedFiles: string[] = [];
    const rules: string[] = [];
    const customModes: Array<{ name: string; prompt: string; tools?: string[] }> = [];

    const src = source.toLowerCase();
    switch (src) {
      case "claude": {
        const claudeMd = join(root, "CLAUDE.md");
        if (existsSync(claudeMd)) {
          detectedFiles.push("CLAUDE.md");
          rules.push(readFileSync(claudeMd, "utf-8"));
        }
        break;
      }

      case "cursor": {
        const cursorRules = join(root, ".cursorrules");
        if (existsSync(cursorRules)) {
          detectedFiles.push(".cursorrules");
          rules.push(readFileSync(cursorRules, "utf-8"));
        }
        break;
      }

      case "cline":
      case "roo": {
        const rooModes = join(root, ".roomodes");
        if (existsSync(rooModes)) {
          detectedFiles.push(".roomodes");
          try {
            const data = JSON.parse(readFileSync(rooModes, "utf-8"));
            if (Array.isArray(data.customModes)) {
              for (const m of data.customModes) {
                customModes.push({
                  name: m.name ?? m.slug ?? "custom",
                  prompt: m.roleDefinition ?? m.customInstructions ?? "",
                  tools: m.groups,
                });
              }
            }
          } catch {}
        }
        break;
      }

      case "aider": {
        const aiderConf = join(root, ".aider.conf.yml");
        if (existsSync(aiderConf)) {
          detectedFiles.push(".aider.conf.yml");
          rules.push(readFileSync(aiderConf, "utf-8"));
        }
        break;
      }
    }

    return {
      source: src as EcosystemSource,
      detectedFiles,
      rules,
      customModes,
    };
  }

  /**
   * Convert imported configuration into standard native Anantham instruction text.
   */
  public convertToNativeInstructions(
    imported: ImportedConfig | EcosystemImportResult
  ): string {
    const sourceName =
      "source" in imported ? String(imported.source) : String(imported.ecosystem);

    const chunks: string[] = [
      `# Anantham Imported Configuration (${sourceName.toUpperCase()})`,
      `> Automatically converted from third-party ecosystem config.`,
      "",
    ];

    if (imported.rules && imported.rules.length > 0) {
      chunks.push("## Guidelines & Directives");
      imported.rules.forEach((r) => chunks.push(r));
    }

    if ("customModes" in imported && imported.customModes.length > 0) {
      chunks.push("\n## Imported Roles / Modes");
      for (const m of imported.customModes) {
        chunks.push(`### Role: ${m.name}`);
        chunks.push(m.prompt);
      }
    }

    if ("agentManifests" in imported && imported.agentManifests.length > 0) {
      chunks.push("\n## Imported Agent Manifests");
      for (const a of imported.agentManifests) {
        chunks.push(`### Agent: ${a.name} (${a.id})`);
        chunks.push(a.systemPrompt);
      }
    }

    if ("mcpServers" in imported && imported.mcpServers && imported.mcpServers.length > 0) {
      chunks.push("\n## Imported MCP Servers");
      for (const s of imported.mcpServers) {
        chunks.push(`- **${s.name}**: command=\`${s.command}\` args=[${s.args?.join(", ") ?? ""}]`);
      }
    }

    return chunks.join("\n\n");
  }
}

// Backward compatibility alias
export class EcosystemConfigImporter extends EcosystemCompatibilityAdapter {}
