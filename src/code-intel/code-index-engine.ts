/**
 * Code Index Engine
 * PRD-CODE-002: CodeIndex API Interface
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import type {
  CodeIndex,
  CodeSymbol,
  CodeLocation,
  CodeDiagnostic,
  ParseResult,
  IndexQueryOptions,
  ImportDeclaration,
  CallReference,
} from "./types.js";
import { MultiLanguageAstParser } from "./parsers/multi-language-ast-parser.js";
import { CodeIntelFaultIsolator } from "./fault-isolator.js";

export class CodeIndexEngine implements CodeIndex {
  private parser: MultiLanguageAstParser;
  private faultIsolator: CodeIntelFaultIsolator;
  private symbols: Map<string, CodeSymbol[]> = new Map(); // filePath -> symbols
  private imports: Map<string, ImportDeclaration[]> = new Map();
  private calls: Map<string, CallReference[]> = new Map();
  private fileContents: Map<string, string> = new Map();
  private diagnostics: Map<string, CodeDiagnostic[]> = new Map();
  private indexedWorkspaces: Set<string> = new Set();

  constructor(options: { faultIsolator?: CodeIntelFaultIsolator } = {}) {
    this.parser = new MultiLanguageAstParser();
    this.faultIsolator = options.faultIsolator ?? new CodeIntelFaultIsolator();
  }

  public async indexWorkspace(workspacePath: string): Promise<void> {
    const root = resolve(workspacePath);
    this.indexedWorkspaces.add(root);
    const files = this.collectFiles(root);

    for (const file of files) {
      await this.indexFile(file);
    }
  }

  public async indexFile(filePath: string, content?: string): Promise<ParseResult> {
    const absPath = resolve(filePath);
    let text = content;
    if (text === undefined) {
      try {
        text = readFileSync(absPath, "utf-8");
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const parseRes: ParseResult = {
          filePath: absPath,
          language: "unknown",
          symbols: [],
          imports: [],
          exports: [],
          calls: [],
          diagnostics: [
            {
              filePath: absPath,
              range: { start: { line: 1, character: 1 }, end: { line: 1, character: 1 } },
              message: `Cannot read file: ${errorMsg}`,
              severity: "error",
            },
          ],
          isPartial: true,
          error: errorMsg,
        };
        this.diagnostics.set(absPath, parseRes.diagnostics);
        return parseRes;
      }
    }

    this.fileContents.set(absPath, text);

    const parseResult = await this.faultIsolator.executeIsolatedParse(absPath, text, (p, c) =>
      this.parser.parse(p, c)
    );

    this.symbols.set(absPath, parseResult.symbols);
    this.imports.set(absPath, parseResult.imports);
    this.calls.set(absPath, parseResult.calls);
    this.diagnostics.set(absPath, parseResult.diagnostics);

    return parseResult;
  }

  public async removeFile(filePath: string): Promise<void> {
    const absPath = resolve(filePath);
    this.symbols.delete(absPath);
    this.imports.delete(absPath);
    this.calls.delete(absPath);
    this.fileContents.delete(absPath);
    this.diagnostics.delete(absPath);
  }

  public async searchText(query: string, options: IndexQueryOptions = {}): Promise<CodeLocation[]> {
    const results: CodeLocation[] = [];
    const limit = options.limit ?? 50;
    const caseSensitive = options.caseSensitive ?? false;
    const searchTarget = caseSensitive ? query : query.toLowerCase();

    for (const [filePath, content] of this.fileContents.entries()) {
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined) continue;
        const lineToSearch = caseSensitive ? line : line.toLowerCase();
        let col = lineToSearch.indexOf(searchTarget);
        while (col !== -1) {
          results.push({
            filePath,
            range: {
              start: { line: i + 1, character: col + 1 },
              end: { line: i + 1, character: col + 1 + query.length },
            },
          });
          if (results.length >= limit) {
            return results;
          }
          col = lineToSearch.indexOf(searchTarget, col + 1);
        }
      }
    }

    return results;
  }

  public async searchSymbols(query: string, options: IndexQueryOptions = {}): Promise<CodeSymbol[]> {
    const results: CodeSymbol[] = [];
    const limit = options.limit ?? 50;
    const caseSensitive = options.caseSensitive ?? false;
    const target = caseSensitive ? query : query.toLowerCase();

    for (const [, symbols] of this.symbols.entries()) {
      for (const sym of symbols) {
        if (options.kind && sym.kind !== options.kind) continue;
        if (options.language && sym.language !== options.language) continue;

        const nameToMatch = caseSensitive ? sym.name : sym.name.toLowerCase();
        if (nameToMatch.includes(target)) {
          results.push(sym);
          if (results.length >= limit) {
            return results;
          }
        }
      }
    }

    return results;
  }

  public async findDefinition(symbolName: string, _contextPath?: string): Promise<CodeLocation[]> {
    const matches: CodeLocation[] = [];
    for (const [filePath, symbols] of this.symbols.entries()) {
      for (const sym of symbols) {
        if (sym.name === symbolName) {
          matches.push({
            filePath,
            range: sym.range,
          });
        }
      }
    }
    return matches;
  }

  public async findReferences(symbolName: string): Promise<CodeLocation[]> {
    const references: CodeLocation[] = [];

    // 1. Check all direct calls
    for (const [filePath, fileCalls] of this.calls.entries()) {
      for (const call of fileCalls) {
        if (call.calleeName === symbolName) {
          references.push({
            filePath,
            range: call.range,
          });
        }
      }
    }

    // 2. Check imports
    for (const [filePath, fileImports] of this.imports.entries()) {
      for (const imp of fileImports) {
        for (const spec of imp.specifiers) {
          if (spec.name === symbolName || spec.alias === symbolName) {
            references.push({
              filePath,
              range: imp.range,
            });
          }
        }
      }
    }

    return references;
  }

  public async relatedFiles(filePath: string): Promise<string[]> {
    const absPath = resolve(filePath);
    const fileDir = dirname(absPath);
    const related = new Set<string>();

    // 1. Files imported by this file
    const fileImports = this.imports.get(absPath) ?? [];
    for (const imp of fileImports) {
      const cleanSource = imp.source.replace(/^\.\//, "").replace(/\.[^/.]+$/, "");
      const resolvedTarget = resolve(fileDir, imp.source).replace(/\.[^/.]+$/, "");
      for (const candidate of this.fileContents.keys()) {
        const cleanCandidate = candidate.replace(/\.[^/.]+$/, "");
        if (
          cleanCandidate === resolvedTarget ||
          cleanCandidate.endsWith(cleanSource) ||
          cleanCandidate.includes(cleanSource)
        ) {
          related.add(candidate);
        }
      }
    }

    // 2. Files that import this file
    const baseNameNoExt = basename(absPath).replace(/\.[^/.]+$/, "");
    for (const [otherFile, otherImports] of this.imports.entries()) {
      if (otherFile === absPath) continue;
      for (const imp of otherImports) {
        if (imp.source.includes(baseNameNoExt)) {
          related.add(otherFile);
        }
      }
    }

    return Array.from(related);
  }

  public async getDiagnostics(filePath?: string): Promise<CodeDiagnostic[]> {
    if (filePath) {
      const absPath = resolve(filePath);
      return this.diagnostics.get(absPath) ?? [];
    }

    const allDiags: CodeDiagnostic[] = [];
    for (const diags of this.diagnostics.values()) {
      allDiags.push(...diags);
    }
    return allDiags;
  }

  public async clear(): Promise<void> {
    this.symbols.clear();
    this.imports.clear();
    this.calls.clear();
    this.fileContents.clear();
    this.diagnostics.clear();
    this.indexedWorkspaces.clear();
  }

  private collectFiles(dirPath: string): string[] {
    const files: string[] = [];
    const ignored = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", ".test_"]);

    const scan = (dir: string) => {
      let entries: string[] = [];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }

      for (const entry of entries) {
        if (ignored.has(entry)) continue;
        const fullPath = join(dir, entry);
        let stat;
        try {
          stat = statSync(fullPath);
        } catch {
          continue;
        }

        if (stat.isDirectory()) {
          scan(fullPath);
        } else if (stat.isFile()) {
          const lang = this.parser.detectLanguage(fullPath);
          if (lang !== "unknown") {
            files.push(fullPath);
          }
        }
      }
    };

    scan(dirPath);
    return files;
  }
}
