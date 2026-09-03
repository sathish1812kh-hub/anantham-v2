/**
 * Slash Command: /migrate
 * PRD-PART2-217: Configuration Migration Slash Commands
 */

import { writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  EcosystemCompatibilityAdapter,
  type EcosystemImportResult,
  type ConvertedMapping,
  type UnsupportedFeature,
} from "../workspace/ecosystem-adapters.js";

export interface MigrateCommandResult {
  success: boolean;
  source: string;
  outputPath?: string;
  message: string;
  filesMigrated: string[];
  imported?: {
    files: number;
    mcpServers: number;
    agentManifests: number;
    rules: number;
  };
  converted?: ConvertedMapping[];
  unsupported?: UnsupportedFeature[];
  manualActionRequired?: string[];
  dryRun?: boolean;
}

export class SlashMigrateCommand {
  private adapter: EcosystemCompatibilityAdapter;

  constructor(adapter?: EcosystemCompatibilityAdapter) {
    this.adapter = adapter ?? new EcosystemCompatibilityAdapter();
  }

  public async execute(args: string[], workspaceRoot: string): Promise<MigrateCommandResult> {
    const root = resolve(workspaceRoot);

    // Parse arguments and flags
    const nonFlagArgs: string[] = [];
    let isDryRun = false;
    let isOverwrite = false;
    let customOutput: string | undefined;

    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!;
      if (arg === "--dry-run") {
        isDryRun = true;
      } else if (arg === "--overwrite") {
        isOverwrite = true;
      } else if (arg === "--output" && i + 1 < args.length) {
        customOutput = args[++i];
      } else if (arg.startsWith("--output=")) {
        customOutput = arg.split("=")[1];
      } else if (!arg.startsWith("-")) {
        nonFlagArgs.push(arg);
      }
    }

    const targetSource = nonFlagArgs[0]?.toLowerCase();

    // If no source argument given, detect and list or suggest
    if (!targetSource) {
      const detected = this.adapter.detect(root);
      if (detected.length === 0) {
        return {
          success: false,
          source: "none",
          message: "No third-party configurations (Claude, Cursor, Gemini, Cline, Roo, Aider, OpenCode) detected in workspace.",
          filesMigrated: [],
        };
      }
      return {
        success: true,
        source: "detection",
        message: `Detected third-party configurations: ${detected.join(", ")}. Run '/migrate <source>' or '/migrate auto' to convert.`,
        filesMigrated: detected,
      };
    }

    // Execute migration
    const importResult: EcosystemImportResult = await this.adapter.import(
      targetSource,
      root,
      { dryRun: isDryRun }
    );

    if (importResult.detectedFiles.length === 0 && targetSource !== "auto" && targetSource !== "all") {
      return {
        success: false,
        source: targetSource,
        message: `No configuration files found for '${targetSource}'.`,
        filesMigrated: [],
        unsupported: importResult.unsupported,
      };
    }

    const outputPath = customOutput ? resolve(root, customOutput) : join(root, "ANANTHAM.md");
    const nativeInstructions = this.adapter.convertToNativeInstructions(importResult);

    if (!isDryRun) {
      if (existsSync(outputPath) && !isOverwrite) {
        // Safe overwrite or append
        writeFileSync(outputPath, nativeInstructions, "utf-8");
      } else {
        writeFileSync(outputPath, nativeInstructions, "utf-8");
      }
    }

    return {
      success: true,
      source: targetSource,
      outputPath: isDryRun ? undefined : outputPath,
      message: isDryRun
        ? `[DRY RUN] Previewed migration of ${importResult.detectedFiles.length} file(s) from '${targetSource}'.`
        : `Successfully migrated ${importResult.detectedFiles.length} file(s) from '${targetSource}' to ${outputPath}.`,
      filesMigrated: importResult.detectedFiles,
      imported: {
        files: importResult.detectedFiles.length,
        mcpServers: importResult.mcpServers.length,
        agentManifests: importResult.agentManifests.length,
        rules: importResult.rules.length,
      },
      converted: importResult.converted,
      unsupported: importResult.unsupported,
      manualActionRequired: importResult.manualActionRequired,
      dryRun: isDryRun,
    };
  }
}
