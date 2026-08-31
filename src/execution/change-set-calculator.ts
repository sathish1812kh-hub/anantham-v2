import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  type ChangeSetMetadata,
  ChangeSetMetadataSchema,
} from "../domain/workspace.js";

const execAsync = promisify(exec);

export interface SymbolModification {
  file: string;
  symbol: string;
  kind: "class" | "interface" | "type" | "function" | "const" | "migration" | "unknown";
}

/**
 * Deterministic Change-Set Calculator.
 * Computes exact file mutations, cryptographic hashes, diff patches,
 * and contract/symbol modifications from an isolated worktree.
 * PRD Part 2 Section 54.
 */
export class ChangeSetCalculator {
  /**
   * Calculate change-set metadata between base commit and worktree HEAD.
   */
  public async calculate(
    workspaceId: string,
    worktreePath: string,
    baseCommit: string,
    targetCommit: string = baseCommit
  ): Promise<ChangeSetMetadata> {
    try {
      // 1. Get HEAD commit of worktree
      const { stdout: headOut } = await execAsync("git rev-parse HEAD", { cwd: worktreePath });
      const headCommit = headOut.trim();

      // 2. Get status of changed files against baseCommit
      // Uses `git diff --name-status <baseCommit>` to include both staged/committed and working tree modifications
      const { stdout: diffStatusOut } = await execAsync(`git diff --name-status "${baseCommit}"`, {
        cwd: worktreePath,
      });

      const filesAdded: string[] = [];
      const filesModified: string[] = [];
      const filesDeleted: string[] = [];
      const filesRenamed: Array<{ from: string; to: string }> = [];

      const lines = diffStatusOut.split("\n").map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        const parts = line.split("\t");
        const status = parts[0];
        const file1 = parts[1];
        const file2 = parts[2];
        if (!status || !file1) continue;

        if (status.startsWith("A")) {
          filesAdded.push(file1);
        } else if (status.startsWith("M")) {
          filesModified.push(file1);
        } else if (status.startsWith("D")) {
          filesDeleted.push(file1);
        } else if (status.startsWith("R") && file2) {
          filesRenamed.push({ from: file1, to: file2 });
        }
      }

      // Also inspect untracked files
      const { stdout: untrackedOut } = await execAsync("git status --porcelain", { cwd: worktreePath });
      const untrackedLines = untrackedOut.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("??"));
      for (const line of untrackedLines) {
        const untrackedFile = line.slice(3).trim();
        if (!filesAdded.includes(untrackedFile)) {
          filesAdded.push(untrackedFile);
        }
      }

      // 3. Compute SHA-256 for all existing modified / added files
      const fileHashes: Record<string, string> = {};
      const allFiles = [...filesAdded, ...filesModified];
      for (const relPath of allFiles) {
        const fullPath = path.join(worktreePath, relPath);
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
          const content = fs.readFileSync(fullPath);
          fileHashes[relPath] = crypto.createHash("sha256").update(content).digest("hex");
        }
      }

      // 4. Extract diff patch
      const { stdout: patchOut } = await execAsync(`git diff "${baseCommit}"`, { cwd: worktreePath });
      const patch = patchOut.trim();

      // 5. Extract modified symbols for domain contracts, migrations, and public index exports
      const symbolsModified = this.extractSymbols(worktreePath, [...filesAdded, ...filesModified, ...filesDeleted]);

      // 6. Compute deterministic changeSetHash
      const hashPayload = JSON.stringify({
        baseCommit,
        headCommit,
        targetCommit,
        filesAdded: [...filesAdded].sort(),
        filesModified: [...filesModified].sort(),
        filesDeleted: [...filesDeleted].sort(),
        filesRenamed,
        fileHashes,
        patch,
      });
      const changeSetHash = crypto.createHash("sha256").update(hashPayload).digest("hex");

      const metadata: ChangeSetMetadata = {
        workspaceId,
        baseCommit,
        headCommit,
        targetCommit,
        filesAdded,
        filesModified,
        filesDeleted,
        filesRenamed,
        fileHashes,
        symbolsModified: symbolsModified.length > 0 ? symbolsModified : undefined,
        patch,
        changeSetHash,
        createdAt: new Date().toISOString(),
      };

      return ChangeSetMetadataSchema.parse(metadata);
    } catch (err: any) {
      throw new Error(`CHANGESET_CALCULATION_FAILED: Failed to calculate changeset for workspace "${workspaceId}": ${err.message}`);
    }
  }

  /**
   * Extract modified symbols from key architectural files (domain, migrations, public index).
   */
  private extractSymbols(worktreePath: string, files: string[]): SymbolModification[] {
    const symbols: SymbolModification[] = [];

    for (const file of files) {
      const fullPath = path.join(worktreePath, file);
      if (!fs.existsSync(fullPath)) continue;

      const normalized = file.replace(/\\/g, "/");

      // Check domain models
      if (normalized.startsWith("src/domain/") || normalized.startsWith("src/persistence/migrations/") || normalized === "src/index.ts") {
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          // Match exported classes, interfaces, types, consts
          const exportMatches = content.matchAll(/export\s+(class|interface|type|const|function|enum)\s+([a-zA-Z0-9_$]+)/g);
          for (const match of exportMatches) {
            const kind = match[1] as SymbolModification["kind"];
            const symbol = match[2];
            if (symbol && kind) {
              symbols.push({
                file: normalized,
                symbol,
                kind,
              });
            }
          }
          // Migration match
          if (normalized.startsWith("src/persistence/migrations/")) {
            symbols.push({
              file: normalized,
              symbol: path.basename(file, ".ts"),
              kind: "migration",
            });
          }
        } catch {
          // ignore read error
        }
      }
    }

    return symbols;
  }
}
