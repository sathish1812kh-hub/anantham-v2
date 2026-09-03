/**
 * Incremental Code Indexer
 * PRD-CODE-005: Incremental Code Indexing
 */

import { createHash } from "node:crypto";
import { basename } from "node:path";
import type { CodeIndex, ParseResult } from "./types.js";

export interface FileIndexState {
  filePath: string;
  sha256: string;
  lastIndexedAt: number;
  symbolNames: Set<string>;
  importSources: Set<string>;
}

export interface IncrementalUpdateSummary {
  filePath: string;
  changed: boolean;
  previousSha256?: string;
  newSha256?: string;
  affectedSymbols: string[];
  affectedDependents: string[];
}

export class IncrementalIndexer {
  private fileStates: Map<string, FileIndexState> = new Map();
  private codeIndex: CodeIndex;

  constructor(codeIndex: CodeIndex) {
    this.codeIndex = codeIndex;
  }

  public computeHash(content: string): string {
    return createHash("sha256").update(content).digest("hex");
  }

  public getFileState(filePath: string): FileIndexState | undefined {
    return this.fileStates.get(filePath);
  }

  public async updateFile(filePath: string, content: string): Promise<IncrementalUpdateSummary> {
    const newHash = this.computeHash(content);
    const existing = this.fileStates.get(filePath);

    if (existing && existing.sha256 === newHash) {
      return {
        filePath,
        changed: false,
        previousSha256: existing.sha256,
        newSha256: newHash,
        affectedSymbols: [],
        affectedDependents: [],
      };
    }

    // Parse and update index
    const parseResult: ParseResult = await this.codeIndex.indexFile(filePath, content);

    const oldSymbols = existing ? Array.from(existing.symbolNames) : [];
    const currentSymbols = parseResult.symbols.map((s) => s.name);
    const currentImports = parseResult.imports.map((i) => i.source);

    // Compute affected symbols: symmetric difference of symbols
    const affectedSymbols = Array.from(
      new Set([
        ...oldSymbols.filter((s) => !currentSymbols.includes(s)),
        ...currentSymbols.filter((s) => !oldSymbols.includes(s)),
      ])
    );

    // Compute affected dependent files in workspace
    const fileBase = basename(filePath).replace(/\.[^/.]+$/, "");
    const affectedDependents: string[] = [];
    for (const [otherPath, state] of this.fileStates.entries()) {
      if (otherPath === filePath) continue;
      for (const imp of state.importSources) {
        const cleanImp = imp.replace(/^\.\//, "").replace(/\.[^/.]+$/, "");
        if (filePath.includes(cleanImp) || fileBase === cleanImp || imp.includes(fileBase)) {
          affectedDependents.push(otherPath);
          break;
        }
      }
    }

    // Save new state
    this.fileStates.set(filePath, {
      filePath,
      sha256: newHash,
      lastIndexedAt: Date.now(),
      symbolNames: new Set(currentSymbols),
      importSources: new Set(currentImports),
    });

    return {
      filePath,
      changed: true,
      previousSha256: existing?.sha256,
      newSha256: newHash,
      affectedSymbols: affectedSymbols.length > 0 ? affectedSymbols : currentSymbols,
      affectedDependents,
    };
  }

  public async removeFile(filePath: string): Promise<string[]> {
    await this.codeIndex.removeFile(filePath);
    this.fileStates.delete(filePath);

    const fileBase = basename(filePath).replace(/\.[^/.]+$/, "");
    const affectedDependents: string[] = [];
    for (const [otherPath, state] of this.fileStates.entries()) {
      for (const imp of state.importSources) {
        const cleanImp = imp.replace(/^\.\//, "").replace(/\.[^/.]+$/, "");
        if (filePath.includes(cleanImp) || fileBase === cleanImp || imp.includes(fileBase)) {
          affectedDependents.push(otherPath);
          break;
        }
      }
    }

    return affectedDependents;
  }
}
